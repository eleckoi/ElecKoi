use crate::grok_core::offset_events;
use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Tag, TagEnd};
use std::ops::Range;

pub const EVENT_CLEAR_TAIL: i32 = 0;
pub const EVENT_APPEND_STABLE: i32 = 1;
pub const EVENT_REPLACE_TAIL: i32 = 2;

const TYPE_PARAGRAPH: i32 = 0;
const TYPE_HEADING: i32 = 1;
const TYPE_QUOTE: i32 = 2;
const TYPE_ORDERED_LIST: i32 = 3;
const TYPE_UNORDERED_LIST: i32 = 4;
const TYPE_CODE_FENCE: i32 = 5;
const TYPE_MATH_BLOCK: i32 = 6;
const TYPE_TABLE: i32 = 7;
const TYPE_HORIZONTAL_RULE: i32 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RootEnd {
    Paragraph,
    Heading,
    BlockQuote,
    CodeBlock,
    HtmlBlock,
    List,
    Table,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BlockRecord {
    block_type: i32,
    metadata: i32,
    range: Range<usize>,
}

#[derive(Debug, Clone, Copy)]
struct ActiveBlock {
    block_type: i32,
    metadata: i32,
    start: usize,
    end: RootEnd,
}

#[derive(Debug, Default)]
struct ParsedTail {
    blocks: Vec<BlockRecord>,
    checkpoint: Option<usize>,
}

#[derive(Debug, Default)]
pub struct BlockSession {
    source: String,
    frozen_bytes: usize,
}

impl BlockSession {
    pub fn append(&mut self, chunk: &str) -> Vec<i32> {
        self.source.push_str(chunk);
        self.snapshot(true)
    }

    pub fn finish(&mut self) -> Vec<i32> {
        self.snapshot(false)
    }

    pub fn reset(&mut self) {
        self.source.clear();
        self.frozen_bytes = 0;
    }

    fn snapshot(&mut self, streaming: bool) -> Vec<i32> {
        let parse_start = self.parse_start();
        let tail = &self.source[parse_start..];
        let parsed = parse_tail(tail);
        let checkpoint = if streaming {
            parsed.checkpoint.unwrap_or(0)
        } else {
            tail.len()
        };

        let mut payload = Vec::with_capacity((parsed.blocks.len() + 1) * 5);
        push_event(
            &mut payload,
            EVENT_CLEAR_TAIL,
            TYPE_PARAGRAPH,
            utf16_offset(&self.source, self.frozen_bytes),
            utf16_offset(&self.source, self.frozen_bytes),
            0,
        );

        for block in parsed.blocks {
            let stable = !streaming || block.range.end <= checkpoint;
            let global_start = parse_start + block.range.start;
            let global_end = parse_start + block.range.end;
            push_event(
                &mut payload,
                if stable {
                    EVENT_APPEND_STABLE
                } else {
                    EVENT_REPLACE_TAIL
                },
                block.block_type,
                utf16_offset(&self.source, global_start),
                utf16_offset(&self.source, global_end),
                block.metadata,
            );
        }

        self.frozen_bytes = if streaming {
            parse_start + checkpoint
        } else {
            self.source.len()
        };
        payload
    }

    // Mirrors Grok Build's streaming renderer: if a frozen block ended immediately before its
    // line terminator, consume that one terminator when reparsing the next tail.
    fn parse_start(&self) -> usize {
        let mut start = self.frozen_bytes.min(self.source.len());
        if start > 0
            && self.source.as_bytes().get(start - 1) != Some(&b'\n')
            && self.source.as_bytes().get(start) == Some(&b'\n')
        {
            start += 1;
        }
        start
    }
}

fn parse_tail(text: &str) -> ParsedTail {
    let mut output = ParsedTail::default();
    let mut active: Option<ActiveBlock> = None;
    let mut container_depth = 0usize;

    for (event, range) in offset_events(text) {
        match event {
            Event::Start(tag) => {
                if active.is_none() {
                    active = root_for_start(&tag, range.start);
                }
                if is_depth_container(&tag) {
                    container_depth += 1;
                }
            }
            Event::End(tag_end) => {
                if is_depth_container_end(&tag_end) {
                    container_depth = container_depth.saturating_sub(1);
                }

                if active.is_some_and(|block| root_matches_end(block.end, &tag_end)) {
                    let mut block = active.take().expect("active block checked above");
                    if block.block_type == TYPE_PARAGRAPH
                        && is_display_math_source(&text[block.start..range.end])
                    {
                        block.block_type = TYPE_MATH_BLOCK;
                    }
                    output.blocks.push(BlockRecord {
                        block_type: block.block_type,
                        metadata: block.metadata,
                        range: block.start..range.end,
                    });
                }

                if container_depth == 0 {
                    if let Some(kind) = checkpoint_kind(&tag_end) {
                        let has_blank = has_blank_line_after(text, range.end);
                        let at_eof = range.end >= text.len();
                        let properly_closed_code = kind == RootEnd::CodeBlock && !at_eof;
                        if has_blank || properly_closed_code {
                            output.checkpoint = Some(if kind == RootEnd::CodeBlock && has_blank {
                                (range.end + 1).min(text.len())
                            } else {
                                range.end
                            });
                        }
                    }
                }
            }
            Event::Rule => {
                if active.is_none() {
                    output.blocks.push(BlockRecord {
                        block_type: TYPE_HORIZONTAL_RULE,
                        metadata: 0,
                        range: range.clone(),
                    });
                }
                if container_depth == 0 {
                    output.checkpoint = Some(range.end);
                }
            }
            Event::DisplayMath(_) if active.is_none() => {
                output.blocks.push(BlockRecord {
                    block_type: TYPE_MATH_BLOCK,
                    metadata: 0,
                    range,
                });
            }
            _ => {}
        }
    }

    output
}

fn root_for_start(tag: &Tag<'_>, start: usize) -> Option<ActiveBlock> {
    let (block_type, metadata, end) = match tag {
        Tag::Paragraph => (TYPE_PARAGRAPH, 0, RootEnd::Paragraph),
        Tag::Heading { level, .. } => (TYPE_HEADING, heading_level(*level), RootEnd::Heading),
        Tag::BlockQuote(_) => (TYPE_QUOTE, 0, RootEnd::BlockQuote),
        Tag::CodeBlock(kind) => (
            TYPE_CODE_FENCE,
            match kind {
                CodeBlockKind::Indented => 0,
                CodeBlockKind::Fenced(_) => 1,
            },
            RootEnd::CodeBlock,
        ),
        Tag::HtmlBlock => (TYPE_PARAGRAPH, 0, RootEnd::HtmlBlock),
        Tag::List(start) => (
            if start.is_some() {
                TYPE_ORDERED_LIST
            } else {
                TYPE_UNORDERED_LIST
            },
            start
                .and_then(|value| i32::try_from(value).ok())
                .unwrap_or(0),
            RootEnd::List,
        ),
        Tag::Table(_) => (TYPE_TABLE, 0, RootEnd::Table),
        _ => return None,
    };
    Some(ActiveBlock {
        block_type,
        metadata,
        start,
        end,
    })
}

fn heading_level(level: HeadingLevel) -> i32 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn root_matches_end(root: RootEnd, end: &TagEnd) -> bool {
    matches!(
        (root, end),
        (RootEnd::Paragraph, TagEnd::Paragraph)
            | (RootEnd::Heading, TagEnd::Heading(_))
            | (RootEnd::BlockQuote, TagEnd::BlockQuote(_))
            | (RootEnd::CodeBlock, TagEnd::CodeBlock)
            | (RootEnd::HtmlBlock, TagEnd::HtmlBlock)
            | (RootEnd::List, TagEnd::List(_))
            | (RootEnd::Table, TagEnd::Table)
    )
}

fn checkpoint_kind(end: &TagEnd) -> Option<RootEnd> {
    match end {
        TagEnd::Paragraph => Some(RootEnd::Paragraph),
        TagEnd::Heading(_) => Some(RootEnd::Heading),
        TagEnd::CodeBlock => Some(RootEnd::CodeBlock),
        TagEnd::BlockQuote(_) => Some(RootEnd::BlockQuote),
        TagEnd::List(_) => Some(RootEnd::List),
        TagEnd::Table => Some(RootEnd::Table),
        TagEnd::HtmlBlock => Some(RootEnd::HtmlBlock),
        _ => None,
    }
}

fn is_depth_container(tag: &Tag<'_>) -> bool {
    matches!(
        tag,
        Tag::BlockQuote(_) | Tag::List(_) | Tag::Item | Tag::Table(_)
    )
}

fn is_depth_container_end(tag: &TagEnd) -> bool {
    matches!(
        tag,
        TagEnd::BlockQuote(_) | TagEnd::List(_) | TagEnd::Item | TagEnd::Table
    )
}

fn has_blank_line_after(text: &str, position: usize) -> bool {
    text.as_bytes()[position.min(text.len())..]
        .iter()
        .copied()
        .find(|byte| *byte != b' ' && *byte != b'\t')
        == Some(b'\n')
}

fn is_display_math_source(source: &str) -> bool {
    let trimmed = source.trim();
    (trimmed.starts_with("$$") && trimmed.ends_with("$$") && trimmed.len() >= 4)
        || (trimmed.starts_with("\\[") && trimmed.ends_with("\\]"))
        || (trimmed.starts_with("\\begin{equation}") && trimmed.ends_with("\\end{equation}"))
        || (trimmed.starts_with("\\begin{equation*}") && trimmed.ends_with("\\end{equation*}"))
}

fn utf16_offset(source: &str, byte_offset: usize) -> i32 {
    let boundary = byte_offset.min(source.len());
    debug_assert!(source.is_char_boundary(boundary));
    i32::try_from(source[..boundary].encode_utf16().count()).unwrap_or(i32::MAX)
}

fn push_event(
    output: &mut Vec<i32>,
    kind: i32,
    block_type: i32,
    start: i32,
    end: i32,
    metadata: i32,
) {
    output.extend_from_slice(&[kind, block_type, start, end, metadata]);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn records(payload: &[i32]) -> Vec<&[i32]> {
        payload.chunks_exact(5).collect()
    }

    #[test]
    fn paragraph_only_freezes_after_blank_line() {
        let mut session = BlockSession::default();
        let first = session.append("hello");
        assert_eq!(records(&first)[1][0], EVENT_REPLACE_TAIL);

        let second = session.append(" world\n\n");
        assert_eq!(records(&second)[1][0], EVENT_APPEND_STABLE);
        assert_eq!(records(&second)[1][1], TYPE_PARAGRAPH);
    }

    #[test]
    fn closed_code_block_uses_grok_checkpoint_rule() {
        let mut session = BlockSession::default();
        let open = session.append("```rust\nfn main() {}");
        assert_eq!(records(&open)[1][0], EVENT_REPLACE_TAIL);
        let closed = session.append("\n```\n");
        assert_eq!(records(&closed)[1][0], EVENT_APPEND_STABLE);
        assert_eq!(records(&closed)[1][1], TYPE_CODE_FENCE);
    }

    #[test]
    fn table_and_list_are_parser_events_not_line_guesses() {
        let mut session = BlockSession::default();
        let table = session.append("| a | b |\n| - | - |\n| 1 | 2 |\n\n");
        assert_eq!(records(&table)[1][1], TYPE_TABLE);
        let list = session.append("- one\n- two\n\n");
        assert_eq!(records(&list)[1][1], TYPE_UNORDERED_LIST);
    }

    #[test]
    fn jni_offsets_remain_kotlin_utf16_offsets() {
        let mut session = BlockSession::default();
        let payload = session.append("猫🐱\n\n");
        let block = records(&payload)[1];
        assert_eq!(block[2], 0);
        // The paragraph range includes its own line terminator but not the separating blank line.
        assert_eq!(block[3], 4);
    }

    #[test]
    fn finish_commits_an_unclosed_tail() {
        let mut session = BlockSession::default();
        session.append("```text\nstill open");
        let payload = session.finish();
        assert_eq!(records(&payload)[1][0], EVENT_APPEND_STABLE);
    }

    #[test]
    fn frozen_prefix_is_not_reemitted_when_the_tail_grows() {
        let mut session = BlockSession::default();
        let first = session.append("# Title\n\nbody");
        let first = records(&first);
        assert_eq!(first[1][0], EVENT_APPEND_STABLE);
        assert_eq!(first[1][1], TYPE_HEADING);
        assert_eq!(first[2][0], EVENT_REPLACE_TAIL);
        assert_eq!(first[2][1], TYPE_PARAGRAPH);

        let second = session.append(" keeps growing");
        let second = records(&second);
        assert_eq!(second.len(), 2, "clear plus the reparsed tail only");
        assert_eq!(second[1][0], EVENT_REPLACE_TAIL);
        assert_eq!(second[1][1], TYPE_PARAGRAPH);
    }

    #[test]
    fn grok_display_math_delimiters_are_classified_as_math_blocks() {
        for source in [
            "\\[x^2\\]\n\n",
            "\\begin{equation}E=mc^2\\end{equation}\n\n",
            "\\begin{equation*}x=1\\end{equation*}\n\n",
        ] {
            let mut session = BlockSession::default();
            let payload = session.append(source);
            assert!(
                records(&payload)
                    .iter()
                    .any(|record| record[1] == TYPE_MATH_BLOCK),
                "expected Grok math block for {source:?}",
            );
        }
    }
}
