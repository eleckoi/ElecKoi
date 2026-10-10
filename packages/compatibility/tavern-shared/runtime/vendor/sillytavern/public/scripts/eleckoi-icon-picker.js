// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original icon picker, bundled icon inventory supplied by the host.
import { Popup, POPUP_TYPE, POPUP_RESULT } from './popup.js';
import { debounce_timeout } from './constants.js';
const debounceMap = new WeakMap();

export function debounce(func, timeout = debounce_timeout.standard) {
    let timer;
    let fn = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
        debounceMap.set(func, timer);
        debounceMap.set(fn, timer);
    };

    return fn;
}

export async function showFontAwesomePicker(customList = null) {
    const faList = customList ?? await fetchFa();
    const fas = {};
    const dom = document.createElement('div'); {
        dom.classList.add('faPicker-container');
        const search = document.createElement('div'); {
            search.classList.add('faQuery-container');
            const qry = document.createElement('input'); {
                qry.classList.add('text_pole');
                qry.classList.add('faQuery');
                qry.type = 'search';
                qry.placeholder = 'Filter icons';
                qry.autofocus = true;
                const qryDebounced = debounce(() => {
                    const result = faList.filter(fa => fa.find(className => className.includes(qry.value.toLowerCase())));
                    for (const fa of faList) {
                        if (!result.includes(fa)) {
                            fas[fa].classList.add('hidden');
                        } else {
                            fas[fa].classList.remove('hidden');
                        }
                    }
                });
                qry.addEventListener('input', () => qryDebounced());
                search.append(qry);
            }
            dom.append(search);
        }
        const grid = document.createElement('div'); {
            grid.classList.add('faPicker');
            for (const fa of faList) {
                const opt = document.createElement('div'); {
                    fas[fa] = opt;
                    opt.classList.add('menu_button');
                    opt.classList.add('fa-solid');
                    opt.classList.add(fa[0]);
                    opt.title = fa.map(it => it.slice(3)).join(', ');
                    opt.dataset.result = POPUP_RESULT.AFFIRMATIVE.toString();
                    opt.addEventListener('click', () => value = fa[0]);
                    grid.append(opt);
                }
            }
            dom.append(grid);
        }
    }
    let value = '';
    const picker = new Popup(dom, POPUP_TYPE.TEXT, null, { allowVerticalScrolling: true, okButton: 'No Icon', cancelButton: 'Cancel' });
    await picker.show();
    if (picker.result == POPUP_RESULT.AFFIRMATIVE) {
        return value;
    }
    return null;
}
