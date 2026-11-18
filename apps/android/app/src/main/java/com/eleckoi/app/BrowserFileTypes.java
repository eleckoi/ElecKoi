package com.eleckoi.app;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.function.Function;
import java.util.regex.Pattern;

final class BrowserFileTypes {
    private static final Pattern MIME = Pattern.compile("[a-z0-9!#$%&'+.^_`|~\\-]+/(?:[a-z0-9!#$%&'+.^_`|~\\-]+|\\*)");

    static String[] openDocumentTypes(String[] accepted, Function<String, String> mimeForExtension) {
        var types = new LinkedHashSet<String>();
        if (accepted != null) for (String value : accepted) {
            if (value == null || value.trim().isEmpty()) continue;
            String type = value.trim().toLowerCase(Locale.ROOT);
            if (type.startsWith(".")) type = mimeForExtension.apply(type.substring(1));
            // An unmappable extension must remain selectable in the system picker.
            if (type == null || "*/*".equals(type)) return new String[0];
            if (MIME.matcher(type).matches()) types.add(type);
        }
        return types.toArray(new String[0]);
    }
}
