#include <windows.h>
#include <commctrl.h>
#include <dwmapi.h>

namespace {

constexpr UINT_PTR kElecKoiFrameSubclassId = 0x454B4F49;
constexpr wchar_t kResizeOverlayClassName[] = L"ElecKoi.ResizeOverlay";

LRESULT HitTestResizeFrameAt(HWND hwnd, POINT cursor) {
  if (IsZoomed(hwnd)) {
    return HTNOWHERE;
  }

  RECT window_rect{};
  if (!GetWindowRect(hwnd, &window_rect)) {
    return HTNOWHERE;
  }

  const UINT dpi = GetDpiForWindow(hwnd);
  const int native_resize_width =
      GetSystemMetricsForDpi(SM_CXFRAME, dpi) +
      GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
  const int native_resize_height =
      GetSystemMetricsForDpi(SM_CYFRAME, dpi) +
      GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
  const int inner_resize_size = MulDiv(12, static_cast<int>(dpi), 96);
  const int resize_width =
      native_resize_width > inner_resize_size
          ? native_resize_width
          : inner_resize_size;
  const int bottom_resize_height =
      native_resize_height > inner_resize_size
          ? native_resize_height
          : inner_resize_size;
  const bool left = cursor.x >= window_rect.left &&
                    cursor.x < window_rect.left + resize_width;
  const bool right = cursor.x < window_rect.right &&
                     cursor.x >= window_rect.right - resize_width;
  const bool top = cursor.y >= window_rect.top &&
                   cursor.y < window_rect.top + native_resize_height;
  const bool bottom = cursor.y < window_rect.bottom &&
                      cursor.y >= window_rect.bottom - bottom_resize_height;

  if (top && left) return HTTOPLEFT;
  if (top && right) return HTTOPRIGHT;
  if (bottom && left) return HTBOTTOMLEFT;
  if (bottom && right) return HTBOTTOMRIGHT;
  if (left) return HTLEFT;
  if (right) return HTRIGHT;
  if (top) return HTTOP;
  if (bottom) return HTBOTTOM;
  return HTNOWHERE;
}

LRESULT HitTestResizeFrame(HWND hwnd, LPARAM l_param) {
  return HitTestResizeFrameAt(
      hwnd,
      POINT{
          static_cast<short>(LOWORD(l_param)),
          static_cast<short>(HIWORD(l_param))});
}

HCURSOR ResizeCursor(LRESULT resize_hit) {
  switch (resize_hit) {
    case HTLEFT:
    case HTRIGHT:
      return LoadCursorW(nullptr, IDC_SIZEWE);
    case HTTOP:
    case HTBOTTOM:
      return LoadCursorW(nullptr, IDC_SIZENS);
    case HTTOPLEFT:
    case HTBOTTOMRIGHT:
      return LoadCursorW(nullptr, IDC_SIZENWSE);
    case HTTOPRIGHT:
    case HTBOTTOMLEFT:
      return LoadCursorW(nullptr, IDC_SIZENESW);
    default:
      return nullptr;
  }
}

LRESULT CALLBACK ElecKoiResizeOverlayProc(
    HWND hwnd,
    UINT message,
    WPARAM w_param,
    LPARAM l_param) {
  const LRESULT resize_hit = static_cast<LRESULT>(
      GetWindowLongPtrW(hwnd, GWLP_USERDATA));

  switch (message) {
    case WM_NCCREATE: {
      const auto* create = reinterpret_cast<const CREATESTRUCTW*>(l_param);
      SetWindowLongPtrW(
          hwnd,
          GWLP_USERDATA,
          reinterpret_cast<LONG_PTR>(create->lpCreateParams));
      return DefWindowProcW(hwnd, message, w_param, l_param);
    }

    case WM_NCHITTEST:
      return resize_hit;

    case WM_SETCURSOR: {
      const HCURSOR resize_cursor = ResizeCursor(resize_hit);
      if (resize_cursor != nullptr) {
        SetCursor(resize_cursor);
        return TRUE;
      }
      break;
    }

    case WM_MOUSEMOVE:
    case WM_NCMOUSEMOVE: {
      const HCURSOR resize_cursor = ResizeCursor(resize_hit);
      if (resize_cursor != nullptr) SetCursor(resize_cursor);
      return 0;
    }

    case WM_NCLBUTTONDOWN:
    case WM_LBUTTONDOWN: {
      const HWND root = GetParent(hwnd);
      if (root != nullptr && IsWindow(root)) {
        POINT cursor{};
        GetCursorPos(&cursor);
        ReleaseCapture();
        SetForegroundWindow(root);
        return DefWindowProcW(
            root,
            WM_NCLBUTTONDOWN,
            static_cast<WPARAM>(resize_hit),
            MAKELPARAM(
                static_cast<WORD>(cursor.x),
                static_cast<WORD>(cursor.y)));
      }
      break;
    }

    case WM_MOUSEACTIVATE:
      return MA_ACTIVATE;

    case WM_ERASEBKGND:
      return TRUE;

    case WM_PAINT: {
      PAINTSTRUCT paint{};
      BeginPaint(hwnd, &paint);
      EndPaint(hwnd, &paint);
      return 0;
    }

    default:
      break;
  }

  return DefWindowProcW(hwnd, message, w_param, l_param);
}

bool EnsureResizeOverlayClass() {
  static const bool registered = [] {
    WNDCLASSEXW window_class{};
    window_class.cbSize = sizeof(window_class);
    window_class.lpfnWndProc = ElecKoiResizeOverlayProc;
    window_class.hInstance = GetModuleHandleW(nullptr);
    window_class.lpszClassName = kResizeOverlayClassName;
    if (RegisterClassExW(&window_class) != 0) return true;
    return GetLastError() == ERROR_CLASS_ALREADY_EXISTS;
  }();
  return registered;
}

HWND FindResizeOverlay(HWND root, LRESULT resize_hit) {
  HWND child = nullptr;
  while ((child = FindWindowExW(
              root, child, kResizeOverlayClassName, nullptr)) != nullptr) {
    if (GetWindowLongPtrW(child, GWLP_USERDATA) == resize_hit) return child;
  }
  return nullptr;
}

void PositionResizeOverlay(
    HWND root,
    LRESULT resize_hit,
    int x,
    int y,
    int width,
    int height) {
  HWND overlay = FindResizeOverlay(root, resize_hit);
  if (overlay == nullptr) {
    overlay = CreateWindowExW(
        WS_EX_NOACTIVATE,
        kResizeOverlayClassName,
        L"",
        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
        x,
        y,
        width,
        height,
        root,
        nullptr,
        GetModuleHandleW(nullptr),
        reinterpret_cast<void*>(static_cast<INT_PTR>(resize_hit)));
  }
  if (overlay == nullptr) return;

  SetWindowPos(
      overlay,
      HWND_TOP,
      x,
      y,
      width,
      height,
      SWP_NOACTIVATE | SWP_SHOWWINDOW);
}

constexpr LRESULT kResizeHits[] = {
    HTTOPLEFT,
    HTTOP,
    HTTOPRIGHT,
    HTLEFT,
    HTRIGHT,
    HTBOTTOMLEFT,
    HTBOTTOM,
    HTBOTTOMRIGHT,
};

void HideResizeOverlays(HWND root) {
  for (const LRESULT resize_hit : kResizeHits) {
    const HWND overlay = FindResizeOverlay(root, resize_hit);
    if (overlay != nullptr) ShowWindow(overlay, SW_HIDE);
  }
}

void LayoutResizeOverlays(HWND root) {
  if (!EnsureResizeOverlayClass()) return;
  if (IsZoomed(root) || IsIconic(root)) {
    HideResizeOverlays(root);
    return;
  }

  RECT client{};
  if (!GetClientRect(root, &client)) return;
  const int width = client.right - client.left;
  const int height = client.bottom - client.top;
  const int edge = MulDiv(12, static_cast<int>(GetDpiForWindow(root)), 96);
  if (width <= edge * 2 || height <= edge * 2) return;

  PositionResizeOverlay(root, HTTOPLEFT, 0, 0, edge, edge);
  PositionResizeOverlay(root, HTTOPRIGHT, width - edge, 0, edge, edge);
  PositionResizeOverlay(root, HTBOTTOMLEFT, 0, height - edge, edge, edge);
  PositionResizeOverlay(
      root, HTBOTTOMRIGHT, width - edge, height - edge, edge, edge);
  PositionResizeOverlay(root, HTTOP, edge, 0, width - edge * 2, edge);
  PositionResizeOverlay(
      root, HTBOTTOM, edge, height - edge, width - edge * 2, edge);
  PositionResizeOverlay(root, HTLEFT, 0, edge, edge, height - edge * 2);
  PositionResizeOverlay(
      root, HTRIGHT, width - edge, edge, edge, height - edge * 2);
}

LRESULT CALLBACK ElecKoiFrameSubclassProc(
    HWND hwnd,
    UINT message,
    WPARAM w_param,
    LPARAM l_param,
    UINT_PTR,
    DWORD_PTR) {
  switch (message) {
    case WM_NCHITTEST: {
      // WM_NCCALCSIZE removes the visible standard frame, so Windows no
      // longer supplies resize hit targets for its invisible sizing border.
      // Recreate those targets using the DPI-aware native frame metrics.
      const LRESULT resize_hit = HitTestResizeFrame(hwnd, l_param);
      if (resize_hit != HTNOWHERE) {
        return resize_hit;
      }
      break;
    }

    case WM_SETCURSOR: {
      const HCURSOR resize_cursor =
          ResizeCursor(static_cast<LRESULT>(LOWORD(l_param)));
      if (resize_cursor != nullptr) {
        SetCursor(resize_cursor);
        return TRUE;
      }
      break;
    }

    case WM_NCLBUTTONDOWN:
      // Electron's custom frame path consumes forwarded resize clicks. Route
      // only the eight native sizing hit codes straight to DefWindowProc so
      // Windows owns the modal resize loop, cursor capture and snap behavior.
      if (ResizeCursor(static_cast<LRESULT>(w_param)) != nullptr) {
        return DefWindowProcW(hwnd, message, w_param, l_param);
      }
      break;

    case WM_NCMOUSEMOVE: {
      const LRESULT result = DefSubclassProc(hwnd, message, w_param, l_param);
      POINT cursor{};
      if (GetCursorPos(&cursor)) {
        const HCURSOR resize_cursor =
            ResizeCursor(HitTestResizeFrameAt(hwnd, cursor));
        if (resize_cursor != nullptr) SetCursor(resize_cursor);
      }
      return result;
    }

    case WM_NCCALCSIZE:
      // Returning zero removes the visible standard frame. Keep Chromium's
      // maximized calculation so the client area respects the work area.
      if (w_param != FALSE && !IsZoomed(hwnd)) {
        return 0;
      }
      break;

    case WM_NCACTIVATE:
      // Preserve activation without letting DefWindowProc repaint the removed
      // non-client frame. This avoids a gray line flashing on focus changes.
      return DefSubclassProc(hwnd, message, w_param, static_cast<LPARAM>(-1));

    case WM_SIZE: {
      const LRESULT result = DefSubclassProc(hwnd, message, w_param, l_param);
      LayoutResizeOverlays(hwnd);
      return result;
    }

    case WM_WINDOWPOSCHANGED: {
      const LRESULT result = DefSubclassProc(hwnd, message, w_param, l_param);
      LayoutResizeOverlays(hwnd);
      return result;
    }

    case WM_NCDESTROY: {
      const LRESULT result = DefSubclassProc(hwnd, message, w_param, l_param);
      RemoveWindowSubclass(hwnd, ElecKoiFrameSubclassProc, kElecKoiFrameSubclassId);
      return result;
    }

    default:
      break;
  }

  return DefSubclassProc(hwnd, message, w_param, l_param);
}

}  // namespace

extern "C" __declspec(dllexport) BOOL WINAPI ElecKoiInstallWindowFrame(HWND hwnd) {
  if (hwnd == nullptr || !IsWindow(hwnd)) {
    return FALSE;
  }

  if (!SetWindowSubclass(hwnd, ElecKoiFrameSubclassProc, kElecKoiFrameSubclassId, 0)) {
    return FALSE;
  }

  // A one-pixel glass extension is enough to keep the Windows 10 DWM shadow
  // after WM_NCCALCSIZE turns the whole normal window into client content.
  const MARGINS shadow_trigger{1, 0, 0, 0};
  if (FAILED(DwmExtendFrameIntoClientArea(hwnd, &shadow_trigger))) {
    RemoveWindowSubclass(hwnd, ElecKoiFrameSubclassProc, kElecKoiFrameSubclassId);
    return FALSE;
  }

  const BOOL frame_changed = SetWindowPos(
      hwnd,
      nullptr,
      0,
      0,
      0,
      0,
      SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE |
          SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
  if (frame_changed) LayoutResizeOverlays(hwnd);
  return frame_changed;
}
