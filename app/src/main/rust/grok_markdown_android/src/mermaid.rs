//! Pure-Rust Mermaid layout, using Grok Build's pinned vendored engine.

use mermaid_to_svg::{render_mermaid_to_svg, MermaidTheme};

const MAX_SOURCE_BYTES: usize = 64 * 1024;

pub fn render_svg(source: &str, dark: bool) -> Option<String> {
    if source.is_empty() || source.len() > MAX_SOURCE_BYTES {
        return None;
    }
    let theme = if dark {
        MermaidTheme::dark()
    } else {
        MermaidTheme::light()
    };
    render_mermaid_to_svg(source, Some(&theme)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flowchart_renders_without_node_or_browser() {
        let svg = render_svg("flowchart LR\nA[Start] --> B[Done]", false).expect("svg");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("Start"));
        assert!(svg.contains("Done"));
    }

    #[test]
    fn invalid_or_oversized_input_falls_back() {
        assert!(render_svg("not-a-diagram", false).is_none());
        assert!(render_svg(&"x".repeat(MAX_SOURCE_BYTES + 1), false).is_none());
    }
}
