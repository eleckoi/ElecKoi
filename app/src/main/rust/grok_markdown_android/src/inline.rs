use crate::grok_core::offset_events;
use linkify::{LinkFinder, LinkKind};
use pulldown_cmark::{Event, Tag, TagEnd};
use xai_grok_markdown::{normalize_latex_delimiters, render_markdown_ratatui_full, MarkdownStyle};

pub(crate) const STYLE_BOLD: i32 = 1 << 0;
pub(crate) const STYLE_ITALIC: i32 = 1 << 1;
pub(crate) const STYLE_STRIKE: i32 = 1 << 2;
pub(crate) const STYLE_CODE: i32 = 1 << 3;
pub(crate) const STYLE_LINK: i32 = 1 << 4;
pub(crate) const STYLE_IMAGE: i32 = 1 << 5;
pub(crate) const STYLE_MATH: i32 = 1 << 6;
pub(crate) const STYLE_UNDERLINE: i32 = 1 << 7;
pub(crate) const STYLE_QUOTE: i32 = 1 << 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InlineSegment {
    pub(crate) text: String,
    pub(crate) style: i32,
    pub(crate) destination: Option<String>,
}

#[derive(Debug, Clone)]
struct StyleFrame {
    style: i32,
    destination: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct ListFrame {
    next: Option<u64>,
}

#[derive(Debug, Default)]
pub struct InlineSession {
    source: String,
}

impl InlineSession {
    pub fn append(&mut self, chunk: &str) -> Vec<u8> {
        self.source.push_str(chunk);
        encode(&parse_inline(&self.source))
    }

    pub fn finish(&self) -> Vec<u8> {
        encode(&parse_inline(&self.source))
    }

    pub fn reset(&mut self) {
        self.source.clear();
    }
}

pub(crate) fn parse_inline(source: &str) -> Vec<InlineSegment> {
    // Grok normalizes \(...\), \[...\] and equation environments before pulldown-cmark sees
    // them. Inline parsing has no source-map consumers, so using the normalized text here is safe.
    let normalized = normalize_latex_delimiters(source);
    let mut output = Vec::new();
    let mut style = 0;
    let mut destination: Option<String> = None;
    let mut style_frames: Vec<StyleFrame> = Vec::new();
    let mut lists: Vec<ListFrame> = Vec::new();
    let mut item_count = 0usize;

    for (event, _) in offset_events(&normalized) {
        match event {
            Event::Start(Tag::Strong) => {
                push_style_frame(&mut style_frames, style, &destination);
                style |= STYLE_BOLD;
            }
            Event::Start(Tag::Emphasis) => {
                push_style_frame(&mut style_frames, style, &destination);
                style |= STYLE_ITALIC;
            }
            Event::Start(Tag::Strikethrough) => {
                push_style_frame(&mut style_frames, style, &destination);
                style |= STYLE_STRIKE;
            }
            Event::Start(Tag::Link { dest_url, .. }) => {
                push_style_frame(&mut style_frames, style, &destination);
                style |= STYLE_LINK;
                destination = Some(dest_url.into_string());
            }
            Event::Start(Tag::Image { dest_url, .. }) => {
                push_style_frame(&mut style_frames, style, &destination);
                // Grok treats image alt text as a hyperlink target in terminal output. Android
                // keeps that same safe behavior instead of fetching remote images implicitly.
                style |= STYLE_IMAGE | STYLE_LINK;
                // For `[![alt](image)](page)`, clicking the visible image label follows the
                // enclosing page link, matching Grok's nested-image hyperlink regression test.
                if destination.is_none() {
                    destination = Some(dest_url.into_string());
                }
            }
            Event::End(TagEnd::Strong)
            | Event::End(TagEnd::Emphasis)
            | Event::End(TagEnd::Strikethrough)
            | Event::End(TagEnd::Link)
            | Event::End(TagEnd::Image) => {
                if let Some(frame) = style_frames.pop() {
                    style = frame.style;
                    destination = frame.destination;
                }
            }
            Event::Start(Tag::List(start)) => lists.push(ListFrame { next: start }),
            Event::End(TagEnd::List(_)) => {
                lists.pop();
            }
            Event::Start(Tag::Item) => {
                if item_count > 0 {
                    append_segment(&mut output, "\n", 0, None);
                }
                let indentation = "  ".repeat(lists.len().saturating_sub(1));
                if !indentation.is_empty() {
                    append_segment(&mut output, &indentation, 0, None);
                }
                let marker = lists
                    .last_mut()
                    .map(|list| match list.next.as_mut() {
                        Some(next) => {
                            let marker = format!("{next}. ");
                            *next = next.saturating_add(1);
                            marker
                        }
                        None => "• ".to_owned(),
                    })
                    .unwrap_or_default();
                append_segment(&mut output, &marker, 0, None);
                item_count += 1;
            }
            Event::Text(text) => {
                append_segment(&mut output, text.as_ref(), style, destination.as_deref());
            }
            Event::Code(code) => {
                append_segment(
                    &mut output,
                    code.as_ref(),
                    style | STYLE_CODE,
                    destination.as_deref(),
                );
            }
            Event::InlineMath(math) => {
                let rendered = render_math_unicode(math.as_ref(), false);
                append_segment(
                    &mut output,
                    &rendered,
                    style | STYLE_MATH,
                    destination.as_deref(),
                );
            }
            Event::DisplayMath(math) => {
                let rendered = render_math_unicode(math.as_ref(), true);
                append_segment(
                    &mut output,
                    &rendered,
                    style | STYLE_MATH,
                    destination.as_deref(),
                );
            }
            Event::SoftBreak => append_segment(&mut output, " ", style, destination.as_deref()),
            Event::HardBreak => append_segment(&mut output, "\n", style, destination.as_deref()),
            Event::Html(html) => {
                append_segment(&mut output, html.as_ref(), style, destination.as_deref());
            }
            Event::InlineHtml(html) => match inline_html_tag(html.as_ref()) {
                InlineHtmlTag::OpenUnderline => {
                    push_style_frame(&mut style_frames, style, &destination);
                    style |= STYLE_UNDERLINE;
                }
                InlineHtmlTag::CloseUnderline => {
                    if let Some(frame) = style_frames.pop() {
                        style = frame.style;
                        destination = frame.destination;
                    }
                }
                InlineHtmlTag::Break => {
                    append_segment(&mut output, "\n", style, destination.as_deref())
                }
                InlineHtmlTag::Literal => {
                    append_segment(&mut output, html.as_ref(), style, destination.as_deref())
                }
            },
            Event::FootnoteReference(name) => {
                append_segment(
                    &mut output,
                    &format!("[^{name}]"),
                    style,
                    destination.as_deref(),
                );
            }
            Event::TaskListMarker(checked) => append_segment(
                &mut output,
                if checked { "☑ " } else { "☐ " },
                style,
                destination.as_deref(),
            ),
            Event::Rule => append_segment(&mut output, "───", style, destination.as_deref()),
            _ => {}
        }
    }

    detect_inline_quotes(&detect_plain_urls(&output))
}

fn push_style_frame(frames: &mut Vec<StyleFrame>, style: i32, destination: &Option<String>) {
    frames.push(StyleFrame {
        style,
        destination: destination.clone(),
    });
}

pub(crate) fn append_segment(
    output: &mut Vec<InlineSegment>,
    text: &str,
    style: i32,
    destination: Option<&str>,
) {
    if text.is_empty() {
        return;
    }
    let destination = destination.map(ToOwned::to_owned);
    if let Some(previous) = output.last_mut() {
        if previous.style == style && previous.destination == destination {
            previous.text.push_str(text);
            return;
        }
    }
    output.push(InlineSegment {
        text: text.to_owned(),
        style,
        destination,
    });
}

/// Mirrors Grok Build's post-render `url_scan`: plain URLs become link targets without
/// requiring Markdown link syntax. Existing Markdown links win, so their visible labels are
/// never rescanned or split.
pub(crate) fn detect_plain_urls(segments: &[InlineSegment]) -> Vec<InlineSegment> {
    let mut finder = LinkFinder::new();
    finder.kinds(&[LinkKind::Url]);
    let mut output = Vec::with_capacity(segments.len());

    for segment in segments {
        if segment.destination.is_some() {
            append_segment(
                &mut output,
                &segment.text,
                segment.style,
                segment.destination.as_deref(),
            );
            continue;
        }

        let mut cursor = 0usize;
        for link in finder.links(&segment.text) {
            if cursor < link.start() {
                append_segment(
                    &mut output,
                    &segment.text[cursor..link.start()],
                    segment.style,
                    None,
                );
            }
            append_segment(
                &mut output,
                &segment.text[link.start()..link.end()],
                segment.style | STYLE_LINK,
                Some(link.as_str()),
            );
            cursor = link.end();
        }
        if cursor < segment.text.len() {
            append_segment(&mut output, &segment.text[cursor..], segment.style, None);
        }
    }

    output
}

fn detect_inline_quotes(segments: &[InlineSegment]) -> Vec<InlineSegment> {
    let mut text = String::new();
    let mut ranges = Vec::with_capacity(segments.len());
    for segment in segments {
        let start = text.len();
        text.push_str(&segment.text);
        ranges.push(start..text.len());
    }

    let mut quoted = Vec::new();
    let mut english_open = None;
    let mut chinese_open = None;
    for (segment, source_range) in segments.iter().zip(&ranges) {
        if segment.style & STYLE_CODE != 0 {
            continue;
        }
        for (offset, character) in segment.text.char_indices() {
            let index = source_range.start + offset;
            match character {
                '"' if !is_escaped_quote(&text, index) => {
                    if let Some(start) = english_open.take() {
                        quoted.push(start..index + character.len_utf8());
                    } else {
                        english_open = Some(index);
                    }
                }
                '“' if chinese_open.is_none() => chinese_open = Some(index),
                '”' => {
                    if let Some(start) = chinese_open.take() {
                        quoted.push(start..index + character.len_utf8());
                    }
                }
                _ => {}
            }
        }
    }
    if quoted.is_empty() {
        return segments.to_vec();
    }

    let mut output = Vec::with_capacity(segments.len() + quoted.len() * 2);
    for (segment, source_range) in segments.iter().zip(ranges) {
        if segment.style & STYLE_CODE != 0 {
            append_segment(
                &mut output,
                &segment.text,
                segment.style,
                segment.destination.as_deref(),
            );
            continue;
        }
        let mut cursor = source_range.start;
        for range in quoted
            .iter()
            .filter(|range| ranges_overlap(range, &source_range))
        {
            let start = range.start.max(source_range.start);
            let end = range.end.min(source_range.end);
            if cursor < start {
                append_segment(
                    &mut output,
                    &text[cursor..start],
                    segment.style,
                    segment.destination.as_deref(),
                );
            }
            append_segment(
                &mut output,
                &text[start..end],
                segment.style | STYLE_QUOTE,
                segment.destination.as_deref(),
            );
            cursor = end;
        }
        if cursor < source_range.end {
            append_segment(
                &mut output,
                &text[cursor..source_range.end],
                segment.style,
                segment.destination.as_deref(),
            );
        }
    }
    output
}

fn is_escaped_quote(text: &str, quote_index: usize) -> bool {
    text[..quote_index]
        .chars()
        .rev()
        .take_while(|character| *character == '\\')
        .count()
        % 2
        == 1
}

fn ranges_overlap(first: &std::ops::Range<usize>, second: &std::ops::Range<usize>) -> bool {
    first.start < second.end && second.start < first.end
}

pub(crate) fn is_br_tag(html: &str) -> bool {
    let trimmed = html.trim();
    let Some(tag) = trimmed
        .strip_prefix('<')
        .and_then(|value| value.strip_suffix('>'))
    else {
        return false;
    };
    tag.trim()
        .strip_suffix('/')
        .unwrap_or(tag.trim())
        .trim()
        .eq_ignore_ascii_case("br")
}

enum InlineHtmlTag {
    OpenUnderline,
    CloseUnderline,
    Break,
    Literal,
}

fn inline_html_tag(html: &str) -> InlineHtmlTag {
    let trimmed = html.trim();
    if is_br_tag(trimmed) {
        return InlineHtmlTag::Break;
    }
    let Some(tag) = trimmed
        .strip_prefix('<')
        .and_then(|value| value.strip_suffix('>'))
    else {
        return InlineHtmlTag::Literal;
    };
    match tag.trim() {
        value if value.eq_ignore_ascii_case("u") => InlineHtmlTag::OpenUnderline,
        value if value.eq_ignore_ascii_case("/u") => InlineHtmlTag::CloseUnderline,
        _ => InlineHtmlTag::Literal,
    }
}

/// Uses Grok Build's own public renderer as the LaTeX-to-Unicode authority. This deliberately
/// avoids maintaining an Android-only command table that would drift from upstream.
pub(crate) fn render_math_unicode(source: &str, display: bool) -> String {
    let wrapped = if display {
        format!("$${source}$$")
    } else {
        format!("${source}$")
    };
    let (rendered, _) =
        render_markdown_ratatui_full(&wrapped, MarkdownStyle::default(), true, None);
    let lines = rendered
        .lines
        .iter()
        .map(|line| {
            line.spans
                .iter()
                .map(|span| span.content.as_ref())
                .collect::<String>()
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        source.to_owned()
    } else if display {
        lines.join("\n")
    } else {
        lines.join("; ")
    }
}

fn encode(segments: &[InlineSegment]) -> Vec<u8> {
    let mut output = Vec::new();
    push_u32(
        &mut output,
        u32::try_from(segments.len()).unwrap_or(u32::MAX),
    );
    for segment in segments {
        push_i32(&mut output, segment.style);
        push_bytes(&mut output, segment.text.as_bytes());
        match &segment.destination {
            Some(destination) => {
                push_i32(
                    &mut output,
                    i32::try_from(destination.len()).unwrap_or(i32::MAX),
                );
                output.extend_from_slice(destination.as_bytes());
            }
            None => push_i32(&mut output, -1),
        }
    }
    output
}

fn push_bytes(output: &mut Vec<u8>, value: &[u8]) {
    push_u32(output, u32::try_from(value.len()).unwrap_or(u32::MAX));
    output.extend_from_slice(value);
}

fn push_u32(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn push_i32(output: &mut Vec<u8>, value: i32) {
    output.extend_from_slice(&value.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn visible(source: &str) -> Vec<InlineSegment> {
        parse_inline(source)
    }

    #[test]
    fn nested_styles_come_from_pulldown_events() {
        let segments = visible("**bold and *italic***");
        assert_eq!(segments[0].text, "bold and ");
        assert_eq!(segments[0].style, STYLE_BOLD);
        assert_eq!(segments[1].text, "italic");
        assert_eq!(segments[1].style, STYLE_BOLD | STYLE_ITALIC);
    }

    #[test]
    fn single_tilde_is_literal_but_double_tilde_is_strike() {
        let segments = visible("~literal~ and ~~gone~~");
        assert_eq!(segments[0].text, "~literal~ and ");
        assert_eq!(segments[0].style, 0);
        assert_eq!(segments[1].text, "gone");
        assert_eq!(segments[1].style, STYLE_STRIKE);
    }

    #[test]
    fn underline_html_is_an_inline_style_not_visible_markup() {
        let segments = visible("before <u>underlined</u> after");
        assert_eq!(segments[1].text, "underlined");
        assert_eq!(segments[1].style, STYLE_UNDERLINE);
    }

    #[test]
    fn english_and_chinese_quote_pairs_get_quote_style() {
        let segments = visible("before \"English\" and “中文” after");
        let quoted = segments
            .iter()
            .filter(|segment| segment.style & STYLE_QUOTE != 0)
            .map(|segment| segment.text.as_str())
            .collect::<Vec<_>>();
        assert_eq!(quoted, vec!["\"English\"", "“中文”"]);
    }

    #[test]
    fn unmatched_or_code_quotes_stay_plain() {
        let segments = visible("unmatched \"quote and `\"code\"`");
        assert!(segments
            .iter()
            .all(|segment| segment.style & STYLE_QUOTE == 0));
    }

    #[test]
    fn reference_link_keeps_resolved_destination() {
        let segments = visible("[site][x]\n\n[x]: https://example.com");
        let link = segments
            .iter()
            .find(|segment| segment.style & STYLE_LINK != 0)
            .expect("link segment");
        assert_eq!(link.text, "site");
        assert_eq!(link.destination.as_deref(), Some("https://example.com"));
    }

    #[test]
    fn list_markers_are_compose_output_not_raw_markdown_delimiters() {
        let text = visible("- one\n- two")
            .into_iter()
            .map(|segment| segment.text)
            .collect::<String>();
        assert_eq!(text, "• one\n• two");
    }

    #[test]
    fn plain_url_uses_grok_linkify_boundaries() {
        let segments = visible("中文 https://example.com. 结尾");
        let link = segments
            .iter()
            .find(|segment| segment.style & STYLE_LINK != 0)
            .expect("plain URL link segment");
        assert_eq!(link.text, "https://example.com");
        assert_eq!(link.destination.as_deref(), Some("https://example.com"));
    }

    #[test]
    fn image_inside_link_uses_the_outer_link_target() {
        let segments =
            visible("[![badge](https://img.shields.io/v1.svg)](https://github.com/example/repo)");
        let image = segments
            .iter()
            .find(|segment| segment.style & STYLE_IMAGE != 0)
            .expect("image alt segment");
        assert_eq!(image.text, "badge");
        assert_eq!(
            image.destination.as_deref(),
            Some("https://github.com/example/repo")
        );
    }
}
