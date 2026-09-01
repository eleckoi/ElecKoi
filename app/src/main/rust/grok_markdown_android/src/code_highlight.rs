//! Grok Build-compatible fenced-code highlighting.
//!
//! The language resolver, `syntect` line state and open-tail cache mirror
//! `xai-grok-markdown/src/syntax.rs` and `open_code_highlighter.rs` at commit `98c3b24`.
//!
//! Grok Build's desktop renderer loads two-face's 250+ language set process-wide. Android keeps
//! syntect's common-language pack process-wide and lazily gives only a visible message its own
//! two-face set when that message actually uses a rarer grammar. The per-message set is dropped
//! with the native session, so history scrolling cannot permanently compile every grammar into
//! the process-wide native heap.

use std::collections::HashMap;
use std::io::Cursor;
use std::path::Path;
use std::sync::OnceLock;

use syntect::highlighting::{
    Color, FontStyle, HighlightIterator, HighlightState, Highlighter, Style, Theme, ThemeSet,
};
use syntect::parsing::{ParseState, ScopeStack, SyntaxReference, SyntaxSet};
use syntect::util::LinesWithEndings;

type HighlightLine = Vec<(Style, String)>;

const CLOSED_MEMO_CAP_BYTES: usize = 256 * 1024;
const FONT_BOLD: i32 = 1;
const FONT_ITALIC: i32 = 1 << 1;
const FONT_UNDERLINE: i32 = 1 << 2;

fn load_theme(bytes: &[u8]) -> Theme {
    ThemeSet::load_from_reader(&mut Cursor::new(bytes)).expect("pinned Grok theme must parse")
}

fn day_theme() -> &'static Theme {
    static THEME: OnceLock<Theme> = OnceLock::new();
    THEME.get_or_init(|| load_theme(include_bytes!("../assets/grok-day.tmTheme")))
}

fn night_theme() -> &'static Theme {
    static THEME: OnceLock<Theme> = OnceLock::new();
    THEME.get_or_init(|| load_theme(include_bytes!("../assets/grok-night.tmTheme")))
}

fn bright_theme() -> &'static Theme {
    static THEME: OnceLock<Theme> = OnceLock::new();
    THEME.get_or_init(|| load_theme(include_bytes!("../assets/eleckoi-bright.tmTheme")))
}

fn parse_line_citation_fence_info(info: &str) -> Option<(&str, &str, &str)> {
    let mut parts = info.splitn(3, ':');
    let start = parts.next()?;
    let end = parts.next()?;
    let path = parts.next()?;
    if start.is_empty() || !start.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if end.is_empty() || !end.chars().all(|c| c.is_ascii_digit()) || path.is_empty() {
        return None;
    }
    Some((start, end, path))
}

fn find_syntax_for_fence_info<'a>(
    syntax_set: &'a SyntaxSet,
    info: &str,
) -> Option<&'a SyntaxReference> {
    if let Some((_, _, path)) = parse_line_citation_fence_info(info) {
        if let Some(syntax) = Path::new(path)
            .extension()
            .and_then(|extension| extension.to_str())
            .and_then(|extension| find_syntax_by_token_or_extension(syntax_set, extension))
        {
            return Some(syntax);
        }
    }
    find_syntax_by_token_or_extension(syntax_set, info)
}

fn find_syntax_by_token_or_extension<'a>(
    syntax_set: &'a SyntaxSet,
    token: &str,
) -> Option<&'a SyntaxReference> {
    let normalized = token
        .split_whitespace()
        .next()
        .unwrap_or(token)
        .trim_start_matches('.')
        .to_ascii_lowercase();
    let alias = match normalized.as_str() {
        "zsh" | "fish" | "shell" | "sh" => "bash",
        "cs" | "csharp" | "dotnet" => "c#",
        "cc" | "cxx" | "hpp" | "hxx" => "cpp",
        "yml" => "yaml",
        "md" | "mdx" => "markdown",
        other => other,
    };
    syntax_set
        .find_syntax_by_token(alias)
        .or_else(|| syntax_set.find_syntax_by_extension(alias))
}

fn highlight_batch(
    theme: &Theme,
    syntax_set: &SyntaxSet,
    syntax: &SyntaxReference,
    text: &str,
) -> Option<Vec<HighlightLine>> {
    let mut highlighter = syntect::easy::HighlightLines::new(syntax, theme);
    LinesWithEndings::from(text)
        .map(|line| {
            highlighter
                .highlight_line(line, syntax_set)
                .ok()
                .map(|segments| {
                    segments
                        .into_iter()
                        .map(|(style, piece)| (style, piece.to_owned()))
                        .collect()
                })
        })
        .collect()
}

struct CodeBlockHighlighter {
    fence_info: String,
    start_in_tail: usize,
    committed_len: usize,
    committed_lines: Vec<HighlightLine>,
    parse_state: ParseState,
    highlight_state: HighlightState,
    syntax_generation: u64,
    closed_memo: HashMap<String, HashMap<String, Vec<HighlightLine>>>,
    closed_memo_bytes: usize,
}

impl CodeBlockHighlighter {
    fn new(theme: &Theme, syntax_set: &SyntaxSet) -> Self {
        let highlighter = Highlighter::new(theme);
        Self {
            fence_info: String::new(),
            start_in_tail: 0,
            committed_len: 0,
            committed_lines: Vec::new(),
            parse_state: ParseState::new(syntax_set.find_syntax_plain_text()),
            highlight_state: HighlightState::new(&highlighter, ScopeStack::new()),
            syntax_generation: 0,
            closed_memo: HashMap::new(),
            closed_memo_bytes: 0,
        }
    }

    fn reset(&mut self, theme: &Theme, syntax_set: &SyntaxSet) {
        *self = Self::new(theme, syntax_set);
    }

    fn highlight_block(
        &mut self,
        theme: &Theme,
        syntax_set: &SyntaxSet,
        syntax: &SyntaxReference,
        syntax_generation: u64,
        fence_info: &str,
        start_in_tail: usize,
        body_reaches_eof: bool,
        text: &str,
    ) -> Option<Vec<HighlightLine>> {
        if body_reaches_eof {
            self.highlight_open(
                theme,
                syntax_set,
                syntax,
                syntax_generation,
                fence_info,
                start_in_tail,
                text,
            )
        } else {
            self.highlight_closed(theme, syntax_set, syntax, fence_info, text)
        }
    }

    fn highlight_closed(
        &mut self,
        theme: &Theme,
        syntax_set: &SyntaxSet,
        syntax: &SyntaxReference,
        fence_info: &str,
        text: &str,
    ) -> Option<Vec<HighlightLine>> {
        if let Some(hit) = self
            .closed_memo
            .get(fence_info)
            .and_then(|entries| entries.get(text))
        {
            return Some(hit.clone());
        }
        let lines = highlight_batch(theme, syntax_set, syntax, text)?;
        if self.closed_memo_bytes.saturating_add(text.len()) > CLOSED_MEMO_CAP_BYTES {
            self.closed_memo.clear();
            self.closed_memo_bytes = 0;
        }
        self.closed_memo
            .entry(fence_info.to_owned())
            .or_default()
            .insert(text.to_owned(), lines.clone());
        self.closed_memo_bytes += text.len();
        Some(lines)
    }

    fn highlight_open(
        &mut self,
        theme: &Theme,
        syntax_set: &SyntaxSet,
        syntax: &SyntaxReference,
        syntax_generation: u64,
        fence_info: &str,
        start_in_tail: usize,
        text: &str,
    ) -> Option<Vec<HighlightLine>> {
        let needs_rebuild = fence_info != self.fence_info
            || start_in_tail != self.start_in_tail
            || syntax_generation != self.syntax_generation
            || !self.committed_prefix_matches(text);
        if needs_rebuild {
            let highlighter = Highlighter::new(theme);
            fence_info.clone_into(&mut self.fence_info);
            self.start_in_tail = start_in_tail;
            self.committed_len = 0;
            self.committed_lines.clear();
            self.parse_state = ParseState::new(syntax);
            self.highlight_state = HighlightState::new(&highlighter, ScopeStack::new());
            self.syntax_generation = syntax_generation;
        }

        if self.committed_len == text.len() {
            return Some(self.committed_lines.clone());
        }

        let highlighter = Highlighter::new(theme);
        let mut tentative = None;
        for line in LinesWithEndings::from(&text[self.committed_len..]) {
            if line.ends_with('\n') {
                let operations = match self.parse_state.parse_line(line, syntax_set) {
                    Ok(operations) => operations,
                    Err(_) => {
                        self.fence_info.clear();
                        return None;
                    }
                };
                let highlighted = HighlightIterator::new(
                    &mut self.highlight_state,
                    &operations,
                    line,
                    &highlighter,
                )
                .map(|(style, piece)| (style, piece.to_owned()))
                .collect();
                self.committed_lines.push(highlighted);
                self.committed_len += line.len();
            } else {
                let mut parse_state = self.parse_state.clone();
                let mut highlight_state = self.highlight_state.clone();
                let operations = match parse_state.parse_line(line, syntax_set) {
                    Ok(operations) => operations,
                    Err(_) => {
                        self.fence_info.clear();
                        return None;
                    }
                };
                tentative = Some(
                    HighlightIterator::new(&mut highlight_state, &operations, line, &highlighter)
                        .map(|(style, piece)| (style, piece.to_owned()))
                        .collect(),
                );
            }
        }

        let mut output = self.committed_lines.clone();
        if let Some(last) = tentative {
            output.push(last);
        }
        Some(output)
    }

    fn committed_prefix_matches(&self, text: &str) -> bool {
        if self.committed_len > text.len() {
            return false;
        }
        let bytes = text.as_bytes();
        let mut position = 0;
        for line in &self.committed_lines {
            for (_, piece) in line {
                let end = position + piece.len();
                if bytes.get(position..end) != Some(piece.as_bytes()) {
                    return false;
                }
                position = end;
            }
        }
        position == self.committed_len
    }
}

#[derive(Clone, Copy)]
struct StyledRange {
    start: usize,
    end: usize,
    style: Style,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CombinedSpan {
    start_utf16: i32,
    end_utf16: i32,
    day_argb: i32,
    night_argb: i32,
    bright_argb: i32,
    font_style: i32,
}

pub struct CodeHighlightSession {
    common_syntax_set: SyntaxSet,
    day: CodeBlockHighlighter,
    night: CodeBlockHighlighter,
    bright: CodeBlockHighlighter,
    extended_syntax_set: Option<SyntaxSet>,
}

impl Default for CodeHighlightSession {
    fn default() -> Self {
        let common_syntax_set = SyntaxSet::load_defaults_newlines();
        Self {
            day: CodeBlockHighlighter::new(day_theme(), &common_syntax_set),
            night: CodeBlockHighlighter::new(night_theme(), &common_syntax_set),
            bright: CodeBlockHighlighter::new(bright_theme(), &common_syntax_set),
            common_syntax_set,
            extended_syntax_set: None,
        }
    }
}

impl CodeHighlightSession {
    pub fn reset(&mut self) {
        self.common_syntax_set = SyntaxSet::load_defaults_newlines();
        self.day.reset(day_theme(), &self.common_syntax_set);
        self.night.reset(night_theme(), &self.common_syntax_set);
        self.bright.reset(bright_theme(), &self.common_syntax_set);
        self.extended_syntax_set = None;
    }

    pub fn highlight(
        &mut self,
        fence_info: &str,
        start_in_tail: usize,
        body_reaches_eof: bool,
        text: &str,
    ) -> Vec<i32> {
        let common = &self.common_syntax_set;
        let use_extended = find_syntax_for_fence_info(common, fence_info).is_none();
        if use_extended && self.extended_syntax_set.is_none() {
            self.extended_syntax_set = Some(two_face::syntax::extra_newlines());
        }
        let syntax_set = if use_extended {
            self.extended_syntax_set
                .as_ref()
                .expect("extended syntax set")
        } else {
            common
        };
        let Some(syntax) = find_syntax_for_fence_info(syntax_set, fence_info) else {
            return vec![0];
        };
        let syntax_generation = if use_extended { 1 } else { 0 };
        let Some(day) = self.day.highlight_block(
            day_theme(),
            syntax_set,
            syntax,
            syntax_generation,
            fence_info,
            start_in_tail,
            body_reaches_eof,
            text,
        ) else {
            return vec![0];
        };
        let Some(night) = self.night.highlight_block(
            night_theme(),
            syntax_set,
            syntax,
            syntax_generation,
            fence_info,
            start_in_tail,
            body_reaches_eof,
            text,
        ) else {
            return vec![0];
        };
        let Some(bright) = self.bright.highlight_block(
            bright_theme(),
            syntax_set,
            syntax,
            syntax_generation,
            fence_info,
            start_in_tail,
            body_reaches_eof,
            text,
        ) else {
            return vec![0];
        };
        encode_spans(&combine_styles(text, &day, &night, &bright))
    }
}

fn flatten(lines: &[HighlightLine]) -> Vec<StyledRange> {
    let mut output = Vec::new();
    let mut position = 0;
    for line in lines {
        for (style, piece) in line {
            let end = position + piece.len();
            if end > position {
                output.push(StyledRange {
                    start: position,
                    end,
                    style: *style,
                });
            }
            position = end;
        }
    }
    output
}

fn combine_styles(
    text: &str,
    day_lines: &[HighlightLine],
    night_lines: &[HighlightLine],
    bright_lines: &[HighlightLine],
) -> Vec<CombinedSpan> {
    if text.is_empty() {
        return Vec::new();
    }
    let day = flatten(day_lines);
    let night = flatten(night_lines);
    let bright = flatten(bright_lines);
    let mut boundaries = Vec::with_capacity((day.len() + night.len() + bright.len()) * 2 + 2);
    boundaries.extend([0, text.len()]);
    for range in day.iter().chain(&night).chain(&bright) {
        boundaries.extend([range.start.min(text.len()), range.end.min(text.len())]);
    }
    boundaries.sort_unstable();
    boundaries.dedup();

    let day_default = default_style(day_theme());
    let night_default = default_style(night_theme());
    let bright_default = default_style(bright_theme());
    let mut day_index = 0;
    let mut night_index = 0;
    let mut bright_index = 0;
    let mut byte_position = 0;
    let mut utf16_position = 0i32;
    let mut output: Vec<CombinedSpan> = Vec::new();

    for pair in boundaries.windows(2) {
        let start = pair[0];
        let end = pair[1];
        if end <= start || !text.is_char_boundary(start) || !text.is_char_boundary(end) {
            continue;
        }
        while day.get(day_index).is_some_and(|range| range.end <= start) {
            day_index += 1;
        }
        while night
            .get(night_index)
            .is_some_and(|range| range.end <= start)
        {
            night_index += 1;
        }
        while bright
            .get(bright_index)
            .is_some_and(|range| range.end <= start)
        {
            bright_index += 1;
        }
        let day_style = day
            .get(day_index)
            .filter(|range| range.start <= start && range.end >= end)
            .map_or(day_default, |range| range.style);
        let night_style = night
            .get(night_index)
            .filter(|range| range.start <= start && range.end >= end)
            .map_or(night_default, |range| range.style);
        let bright_style = bright
            .get(bright_index)
            .filter(|range| range.start <= start && range.end >= end)
            .map_or(bright_default, |range| range.style);

        utf16_position +=
            i32::try_from(text[byte_position..start].encode_utf16().count()).unwrap_or(i32::MAX);
        let start_utf16 = utf16_position;
        utf16_position +=
            i32::try_from(text[start..end].encode_utf16().count()).unwrap_or(i32::MAX);
        byte_position = end;

        let span = CombinedSpan {
            start_utf16,
            end_utf16: utf16_position,
            day_argb: argb(day_style.foreground),
            night_argb: argb(night_style.foreground),
            bright_argb: argb(bright_style.foreground),
            font_style: font_flags(
                day_style.font_style | night_style.font_style | bright_style.font_style,
            ),
        };
        let merged = if let Some(previous) = output.last_mut() {
            if previous.end_utf16 == span.start_utf16
                && previous.day_argb == span.day_argb
                && previous.night_argb == span.night_argb
                && previous.bright_argb == span.bright_argb
                && previous.font_style == span.font_style
            {
                previous.end_utf16 = span.end_utf16;
                true
            } else {
                false
            }
        } else {
            false
        };
        if !merged {
            output.push(span);
        }
    }
    output
}

fn default_style(theme: &Theme) -> Style {
    Style {
        foreground: theme.settings.foreground.unwrap_or(Color {
            r: 128,
            g: 128,
            b: 128,
            a: 255,
        }),
        background: theme.settings.background.unwrap_or(Color {
            r: 0,
            g: 0,
            b: 0,
            a: 0,
        }),
        font_style: FontStyle::empty(),
    }
}

fn argb(color: Color) -> i32 {
    u32::from_be_bytes([color.a, color.r, color.g, color.b]) as i32
}

fn font_flags(style: FontStyle) -> i32 {
    let mut flags = 0;
    if style.contains(FontStyle::BOLD) {
        flags |= FONT_BOLD;
    }
    if style.contains(FontStyle::ITALIC) {
        flags |= FONT_ITALIC;
    }
    if style.contains(FontStyle::UNDERLINE) {
        flags |= FONT_UNDERLINE;
    }
    flags
}

fn encode_spans(spans: &[CombinedSpan]) -> Vec<i32> {
    let mut output = Vec::with_capacity(1 + spans.len() * 6);
    output.push(i32::try_from(spans.len()).unwrap_or(i32::MAX));
    for span in spans {
        output.extend([
            span.start_utf16,
            span.end_utf16,
            span.day_argb,
            span.night_argb,
            span.bright_argb,
            span.font_style,
        ]);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn python_uses_all_pinned_theme_colors() {
        let text = "async def greet(name: str) -> str:\n    return f\"hi {name}\"\n";
        let mut session = CodeHighlightSession::default();
        let payload = session.highlight("python", 0, false, text);
        assert!(payload[0] > 3, "expected several syntax styles");
        let day_colors: std::collections::HashSet<_> =
            payload[1..].chunks_exact(6).map(|span| span[2]).collect();
        let night_colors: std::collections::HashSet<_> =
            payload[1..].chunks_exact(6).map(|span| span[3]).collect();
        let bright_colors: std::collections::HashSet<_> =
            payload[1..].chunks_exact(6).map(|span| span[4]).collect();
        assert!(day_colors.len() > 2);
        assert!(night_colors.len() > 2);
        assert!(bright_colors.len() > 2);
    }

    #[test]
    fn append_only_stream_matches_fresh_batch() {
        let full = "def answer(x):\n    # comment\n    return x * 42\n";
        let mut incremental = CodeHighlightSession::default();
        for end in 1..=full.len() {
            if !full.is_char_boundary(end) {
                continue;
            }
            let got = incremental.highlight("python", 7, true, &full[..end]);
            let mut fresh = CodeHighlightSession::default();
            let expected = fresh.highlight("python", 7, false, &full[..end]);
            assert_eq!(got, expected, "prefix length {end}");
        }
    }

    #[test]
    fn offsets_are_kotlin_utf16_units() {
        let text = "name = \"猫🐈\"\n";
        let mut session = CodeHighlightSession::default();
        let payload = session.highlight("python", 0, false, text);
        let final_end = payload[1..]
            .chunks_exact(6)
            .map(|span| span[1])
            .max()
            .expect("highlight span");
        assert_eq!(final_end as usize, text.encode_utf16().count());
    }

    #[test]
    fn unknown_language_falls_back_to_plain_code() {
        let mut session = CodeHighlightSession::default();
        assert_eq!(
            session.highlight("not-a-language-xyz", 0, false, "text"),
            vec![0]
        );
    }

    #[test]
    fn rare_languages_are_loaded_only_for_the_current_session() {
        let mut session = CodeHighlightSession::default();
        assert!(find_syntax_for_fence_info(&session.common_syntax_set, "kotlin").is_none());
        assert!(session.extended_syntax_set.is_none());
        assert!(session.highlight("kotlin", 0, false, "fun main() = println(1)")[0] > 0);
        assert!(session.extended_syntax_set.is_some());
        session.reset();
        assert!(session.extended_syntax_set.is_none());
    }
}
