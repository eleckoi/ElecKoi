use crate::grok_core::offset_events;
use crate::inline::{
    append_segment, detect_plain_urls, is_br_tag, render_math_unicode, InlineSegment, STYLE_BOLD,
    STYLE_CODE, STYLE_IMAGE, STYLE_ITALIC, STYLE_LINK, STYLE_MATH, STYLE_STRIKE,
};
use pulldown_cmark::{Alignment, Event, Tag, TagEnd};
use xai_grok_markdown::normalize_latex_delimiters;

const FORMAT_VERSION: i32 = 1;

#[derive(Debug, Default)]
struct TableDocument {
    alignments: Vec<Alignment>,
    rows: Vec<TableRow>,
}

#[derive(Debug, Default)]
struct TableRow {
    header: bool,
    cells: Vec<Vec<InlineSegment>>,
}

#[derive(Debug, Clone)]
struct StyleFrame {
    style: i32,
    destination: Option<String>,
}

pub fn parse_and_encode(source: &str) -> Vec<u8> {
    encode(&parse(source))
}

fn parse(source: &str) -> TableDocument {
    let normalized = normalize_latex_delimiters(source);
    let mut document = TableDocument::default();
    let mut current_row: Option<TableRow> = None;
    let mut current_cell: Option<Vec<InlineSegment>> = None;
    let mut in_header = false;
    let mut style = 0;
    let mut destination: Option<String> = None;
    let mut style_frames = Vec::<StyleFrame>::new();

    for (event, _) in offset_events(&normalized) {
        match event {
            Event::Start(Tag::Table(alignments)) => document.alignments = alignments.to_vec(),
            Event::Start(Tag::TableHead) => {
                in_header = true;
                // pulldown-cmark emits TableHead -> TableCell directly; unlike body rows there is
                // no nested TableRow event. Grok keeps a dedicated header row for this reason.
                current_row = Some(TableRow {
                    header: true,
                    cells: Vec::new(),
                });
            }
            Event::Start(Tag::TableRow) => {
                current_row = Some(TableRow {
                    header: in_header,
                    cells: Vec::new(),
                });
            }
            Event::Start(Tag::TableCell) => current_cell = Some(Vec::new()),
            Event::Start(Tag::Strong) => push_style(
                &mut style_frames,
                style,
                &destination,
                &mut style,
                STYLE_BOLD,
            ),
            Event::Start(Tag::Emphasis) => push_style(
                &mut style_frames,
                style,
                &destination,
                &mut style,
                STYLE_ITALIC,
            ),
            Event::Start(Tag::Strikethrough) => push_style(
                &mut style_frames,
                style,
                &destination,
                &mut style,
                STYLE_STRIKE,
            ),
            Event::Start(Tag::Link { dest_url, .. }) => {
                style_frames.push(StyleFrame {
                    style,
                    destination: destination.clone(),
                });
                style |= STYLE_LINK;
                destination = Some(dest_url.into_string());
            }
            Event::Start(Tag::Image { dest_url, .. }) => {
                style_frames.push(StyleFrame {
                    style,
                    destination: destination.clone(),
                });
                style |= STYLE_IMAGE | STYLE_LINK;
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
            Event::Text(text) => append_current(
                &mut current_cell,
                text.as_ref(),
                style,
                destination.as_deref(),
            ),
            Event::Code(code) => append_current(
                &mut current_cell,
                code.as_ref(),
                style | STYLE_CODE,
                destination.as_deref(),
            ),
            Event::InlineMath(math) => {
                let rendered = render_math_unicode(math.as_ref(), false);
                append_current(
                    &mut current_cell,
                    &rendered,
                    style | STYLE_MATH,
                    destination.as_deref(),
                );
            }
            Event::DisplayMath(math) => {
                let rendered = render_math_unicode(math.as_ref(), false);
                append_current(
                    &mut current_cell,
                    &rendered,
                    style | STYLE_MATH,
                    destination.as_deref(),
                );
            }
            Event::SoftBreak => {
                append_current(&mut current_cell, " ", style, destination.as_deref())
            }
            Event::HardBreak => {
                append_current(&mut current_cell, "\n", style, destination.as_deref())
            }
            Event::Html(html) => append_current(
                &mut current_cell,
                html.as_ref(),
                style,
                destination.as_deref(),
            ),
            Event::InlineHtml(html) => append_current(
                &mut current_cell,
                if is_br_tag(html.as_ref()) {
                    "\n"
                } else {
                    html.as_ref()
                },
                style,
                destination.as_deref(),
            ),
            Event::TaskListMarker(checked) => append_current(
                &mut current_cell,
                if checked { "☑ " } else { "☐ " },
                style,
                destination.as_deref(),
            ),
            Event::End(TagEnd::TableCell) => {
                if let (Some(row), Some(cell)) = (current_row.as_mut(), current_cell.take()) {
                    row.cells.push(detect_plain_urls(&cell));
                }
                style = 0;
                destination = None;
                style_frames.clear();
            }
            Event::End(TagEnd::TableRow) => {
                if let Some(mut row) = current_row.take() {
                    if row.header {
                        for cell in &mut row.cells {
                            for segment in cell {
                                segment.style |= STYLE_BOLD;
                            }
                        }
                    }
                    document.rows.push(row);
                }
            }
            Event::End(TagEnd::TableHead) => {
                if let Some(mut row) = current_row.take() {
                    for cell in &mut row.cells {
                        for segment in cell {
                            segment.style |= STYLE_BOLD;
                        }
                    }
                    document.rows.push(row);
                }
                in_header = false;
            }
            _ => {}
        }
    }
    document
}

fn push_style(
    frames: &mut Vec<StyleFrame>,
    style: i32,
    destination: &Option<String>,
    current: &mut i32,
    addition: i32,
) {
    frames.push(StyleFrame {
        style,
        destination: destination.clone(),
    });
    *current |= addition;
}

fn append_current(
    current_cell: &mut Option<Vec<InlineSegment>>,
    text: &str,
    style: i32,
    destination: Option<&str>,
) {
    if let Some(cell) = current_cell.as_mut() {
        append_segment(cell, text, style, destination);
    }
}

fn encode(document: &TableDocument) -> Vec<u8> {
    let mut output = Vec::new();
    push_i32(&mut output, FORMAT_VERSION);
    push_i32(&mut output, document.alignments.len() as i32);
    for alignment in &document.alignments {
        push_i32(
            &mut output,
            match alignment {
                Alignment::None => 0,
                Alignment::Left => 1,
                Alignment::Center => 2,
                Alignment::Right => 3,
            },
        );
    }
    push_i32(&mut output, document.rows.len() as i32);
    for row in &document.rows {
        push_i32(&mut output, i32::from(row.header));
        push_i32(&mut output, row.cells.len() as i32);
        for cell in &row.cells {
            push_i32(&mut output, cell.len() as i32);
            for segment in cell {
                push_i32(&mut output, segment.style);
                push_bytes(&mut output, segment.text.as_bytes());
                match &segment.destination {
                    Some(value) => push_bytes(&mut output, value.as_bytes()),
                    None => push_i32(&mut output, -1),
                }
            }
        }
    }
    output
}

fn push_i32(output: &mut Vec<u8>, value: i32) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn push_bytes(output: &mut Vec<u8>, value: &[u8]) {
    push_i32(output, i32::try_from(value.len()).unwrap_or(i32::MAX));
    output.extend_from_slice(value);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_preserves_grok_cell_semantics() {
        let parsed = parse(
            "| Name | Formula | Link |\n|:--|:--:|--:|\n| **bold** | $x^2$ | [site](https://example.com) |\n",
        );
        assert_eq!(
            parsed.alignments,
            vec![Alignment::Left, Alignment::Center, Alignment::Right]
        );
        assert!(parsed.rows[0].cells[0][0].style & STYLE_BOLD != 0);
        assert_eq!(parsed.rows[1].cells[0][0].text, "bold");
        assert!(parsed.rows[1].cells[0][0].style & STYLE_BOLD != 0);
        assert_eq!(parsed.rows[1].cells[1][0].text, "x²");
        assert_eq!(
            parsed.rows[1].cells[2][0].destination.as_deref(),
            Some("https://example.com")
        );
    }

    #[test]
    fn escaped_pipe_and_br_stay_inside_their_cells() {
        let parsed = parse("| A | B |\n|---|---|\n| a\\|b | one<br>two |\n");
        assert_eq!(parsed.rows[1].cells.len(), 2);
        assert_eq!(parsed.rows[1].cells[0][0].text, "a|b");
        assert_eq!(parsed.rows[1].cells[1][0].text, "one\ntwo");
    }

    #[test]
    fn plain_url_in_table_is_clickable() {
        let parsed = parse("| Link |\n|---|\n| https://example.com. |\n");
        let link = parsed.rows[1].cells[0]
            .iter()
            .find(|segment| segment.style & STYLE_LINK != 0)
            .expect("plain URL link segment");
        assert_eq!(link.text, "https://example.com");
        assert_eq!(link.destination.as_deref(), Some("https://example.com"));
    }
}
