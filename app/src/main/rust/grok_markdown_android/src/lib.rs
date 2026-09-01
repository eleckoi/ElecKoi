mod blocks;
mod code_highlight;
mod grok_core;
mod inline;
mod mermaid;
mod table;

use blocks::BlockSession;
use code_highlight::CodeHighlightSession;
use inline::InlineSession;
use jni::objects::{JByteArray, JIntArray, JObject, JString};
use jni::sys::{jboolean, jbyteArray, jint, jintArray, jlong, jstring, JNI_FALSE};
use jni::JNIEnv;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr::null_mut;

fn read_string(env: &mut JNIEnv<'_>, value: &JString<'_>) -> Option<String> {
    match env.get_string(value) {
        Ok(text) => Some(text.into()),
        Err(error) => {
            let _ = env.throw_new(
                "java/lang/IllegalArgumentException",
                format!("Invalid Markdown JNI string: {error}"),
            );
            None
        }
    }
}

fn block_session<'a>(handle: jlong) -> Option<&'a mut BlockSession> {
    if handle == 0 {
        None
    } else {
        // SAFETY: handles are created by `Box::into_raw` below and are destroyed exactly once by
        // the matching Kotlin owner. Kotlin serializes every call through the document assembler.
        Some(unsafe { &mut *(handle as *mut BlockSession) })
    }
}

fn inline_session<'a>(handle: jlong) -> Option<&'a mut InlineSession> {
    if handle == 0 {
        None
    } else {
        // SAFETY: same ownership contract as `block_session`, for the inline parser handle.
        Some(unsafe { &mut *(handle as *mut InlineSession) })
    }
}

fn code_highlight_session<'a>(handle: jlong) -> Option<&'a mut CodeHighlightSession> {
    if handle == 0 {
        None
    } else {
        // SAFETY: same ownership contract as `block_session`, for the code highlighter handle.
        Some(unsafe { &mut *(handle as *mut CodeHighlightSession) })
    }
}

fn int_array(env: &mut JNIEnv<'_>, values: &[i32]) -> jintArray {
    let result = (|| -> jni::errors::Result<JIntArray<'_>> {
        let array = env.new_int_array(i32::try_from(values.len()).unwrap_or(i32::MAX))?;
        env.set_int_array_region(&array, 0, values)?;
        Ok(array)
    })();
    match result {
        Ok(array) => array.into_raw(),
        Err(error) => {
            let _ = env.throw_new(
                "java/lang/IllegalStateException",
                format!("Unable to return Markdown block payload: {error}"),
            );
            null_mut()
        }
    }
}

fn byte_array(env: &mut JNIEnv<'_>, values: &[u8]) -> jbyteArray {
    match env.byte_array_from_slice(values) {
        Ok(array) => array.into_raw(),
        Err(error) => {
            let _ = env.throw_new(
                "java/lang/IllegalStateException",
                format!("Unable to return Markdown inline payload: {error}"),
            );
            null_mut()
        }
    }
}

fn report_panic(env: &mut JNIEnv<'_>, operation: &str) {
    let _ = env.throw_new(
        "java/lang/IllegalStateException",
        format!("Grok Markdown native operation panicked: {operation}"),
    );
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeMermaidRenderer_nativeRenderSvg(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    source: JString<'_>,
    dark: jboolean,
) -> jstring {
    let Some(source) = read_string(&mut env, &source) else {
        return null_mut();
    };
    let rendered = catch_unwind(AssertUnwindSafe(|| {
        mermaid::render_svg(&source, dark != JNI_FALSE)
    }));
    match rendered {
        Ok(Some(svg)) => match env.new_string(svg) {
            Ok(value) => value.into_raw(),
            Err(error) => {
                let _ = env.throw_new(
                    "java/lang/IllegalStateException",
                    format!("Unable to return Mermaid SVG: {error}"),
                );
                null_mut()
            }
        },
        // Invalid/unsupported diagrams intentionally fall back to their code fence in Compose.
        Ok(None) => null_mut(),
        Err(_) => {
            report_panic(&mut env, "Mermaid render");
            null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeMarkdownTableParser_nativeParse(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    source: JString<'_>,
) -> jbyteArray {
    let Some(source) = read_string(&mut env, &source) else {
        return null_mut();
    };
    match catch_unwind(AssertUnwindSafe(|| table::parse_and_encode(&source))) {
        Ok(values) => byte_array(&mut env, &values),
        Err(_) => {
            report_panic(&mut env, "table parse");
            null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeMarkdownParser_nativeCreate(
    _env: JNIEnv<'_>,
    _this: JObject<'_>,
) -> jlong {
    Box::into_raw(Box::new(BlockSession::default())) as jlong
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeMarkdownParser_nativeAppend(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
    chunk: JString<'_>,
) -> jintArray {
    let Some(chunk) = read_string(&mut env, &chunk) else {
        return null_mut();
    };
    let result = catch_unwind(AssertUnwindSafe(|| {
        block_session(handle).map(|session| session.append(&chunk))
    }));
    match result {
        Ok(Some(values)) => int_array(&mut env, &values),
        Ok(None) => {
            let _ = env.throw_new(
                "java/lang/IllegalStateException",
                "Markdown parser is closed",
            );
            null_mut()
        }
        Err(_) => {
            report_panic(&mut env, "append");
            null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeMarkdownParser_nativeFinish(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) -> jintArray {
    let result = catch_unwind(AssertUnwindSafe(|| {
        block_session(handle).map(BlockSession::finish)
    }));
    match result {
        Ok(Some(values)) => int_array(&mut env, &values),
        Ok(None) => {
            let _ = env.throw_new(
                "java/lang/IllegalStateException",
                "Markdown parser is closed",
            );
            null_mut()
        }
        Err(_) => {
            report_panic(&mut env, "finish");
            null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeMarkdownParser_nativeReset(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) {
    if let Some(session) = block_session(handle) {
        session.reset();
    } else {
        let _ = env.throw_new(
            "java/lang/IllegalStateException",
            "Markdown parser is closed",
        );
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeMarkdownParser_nativeDestroy(
    _env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) {
    if handle != 0 {
        // SAFETY: ownership is returned exactly once from the pointer created by nativeCreate.
        drop(unsafe { Box::from_raw(handle as *mut BlockSession) });
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeInlineMarkdownParser_nativeCreate(
    _env: JNIEnv<'_>,
    _this: JObject<'_>,
) -> jlong {
    Box::into_raw(Box::new(InlineSession::default())) as jlong
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeInlineMarkdownParser_nativeAppend(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
    chunk: JString<'_>,
) -> jbyteArray {
    let Some(chunk) = read_string(&mut env, &chunk) else {
        return null_mut();
    };
    let result = catch_unwind(AssertUnwindSafe(|| {
        inline_session(handle).map(|session| session.append(&chunk))
    }));
    match result {
        Ok(Some(values)) => byte_array(&mut env, &values),
        Ok(None) => {
            let _ = env.throw_new("java/lang/IllegalStateException", "Inline parser is closed");
            null_mut()
        }
        Err(_) => {
            report_panic(&mut env, "inline append");
            null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeInlineMarkdownParser_nativeFinish(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) -> jbyteArray {
    let result = catch_unwind(AssertUnwindSafe(|| {
        inline_session(handle).map(|session| session.finish())
    }));
    match result {
        Ok(Some(values)) => byte_array(&mut env, &values),
        Ok(None) => {
            let _ = env.throw_new("java/lang/IllegalStateException", "Inline parser is closed");
            null_mut()
        }
        Err(_) => {
            report_panic(&mut env, "inline finish");
            null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeInlineMarkdownParser_nativeReset(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) {
    if let Some(session) = inline_session(handle) {
        session.reset();
    } else {
        let _ = env.throw_new("java/lang/IllegalStateException", "Inline parser is closed");
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeInlineMarkdownParser_nativeDestroy(
    _env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) {
    if handle != 0 {
        // SAFETY: ownership is returned exactly once from the pointer created by nativeCreate.
        drop(unsafe { Box::from_raw(handle as *mut InlineSession) });
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeCodeHighlighter_nativeCreate(
    _env: JNIEnv<'_>,
    _this: JObject<'_>,
) -> jlong {
    Box::into_raw(Box::new(CodeHighlightSession::default())) as jlong
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeCodeHighlighter_nativeHighlight(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
    fence_info: JString<'_>,
    start_in_tail: jint,
    body_reaches_eof: jboolean,
    text: JString<'_>,
) -> jintArray {
    let Some(fence_info) = read_string(&mut env, &fence_info) else {
        return null_mut();
    };
    let Some(text) = read_string(&mut env, &text) else {
        return null_mut();
    };
    let result = catch_unwind(AssertUnwindSafe(|| {
        code_highlight_session(handle).map(|session| {
            session.highlight(
                &fence_info,
                usize::try_from(start_in_tail).unwrap_or_default(),
                body_reaches_eof != JNI_FALSE,
                &text,
            )
        })
    }));
    match result {
        Ok(Some(values)) => int_array(&mut env, &values),
        Ok(None) => {
            let _ = env.throw_new(
                "java/lang/IllegalStateException",
                "Code highlighter is closed",
            );
            null_mut()
        }
        Err(_) => {
            report_panic(&mut env, "code highlight");
            null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeCodeHighlighter_nativeReset(
    mut env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) {
    if let Some(session) = code_highlight_session(handle) {
        session.reset();
    } else {
        let _ = env.throw_new(
            "java/lang/IllegalStateException",
            "Code highlighter is closed",
        );
    }
}

#[no_mangle]
pub extern "system" fn Java_com_eleckoi_android_feature_chat_data_markdown_NativeCodeHighlighter_nativeDestroy(
    _env: JNIEnv<'_>,
    _this: JObject<'_>,
    handle: jlong,
) {
    if handle != 0 {
        // SAFETY: ownership is returned exactly once from the pointer created by nativeCreate.
        drop(unsafe { Box::from_raw(handle as *mut CodeHighlightSession) });
    }
}

// Keep these imports exercised in host builds; they are the exact primitive array types used by
// the exported JNI ABI even though their wrappers are created inside helper functions.
#[allow(dead_code)]
fn _jni_array_type_check(_: JByteArray<'_>, _: JIntArray<'_>) {}
