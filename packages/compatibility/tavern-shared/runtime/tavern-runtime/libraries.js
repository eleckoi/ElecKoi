import lodash from 'lodash';
import Fuse from 'fuse.js';
import createDOMPurify from 'dompurify';
import hljs from 'highlight.js';
import localforage from 'localforage';
import Handlebars from 'handlebars';
import * as css from '@adobe/css-tools';
import Bowser from 'bowser';
import DiffMatchPatch from 'diff-match-patch';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import SVGInject from '@iconfu/svg-inject';
import showdown from 'showdown';
import moment from 'moment';
import seedrandom from 'seedrandom';
import * as Popper from '@popperjs/core';
import droll from 'droll';
import morphdom from 'morphdom';
import { toggle as slideToggle } from 'slidetoggle';
import chalk from 'chalk';
import yaml from 'yaml';
import * as chevrotain from 'chevrotain';
import { gzipSync, gzip } from 'fflate';
import { sha256 } from 'js-sha256';
const DOMPurify = createDOMPurify(globalThis.document?.defaultView || globalThis.window);
export { lodash, Fuse, DOMPurify, hljs, localforage, Handlebars, css, Bowser, DiffMatchPatch, Readability, isProbablyReaderable, SVGInject,
  showdown, moment, seedrandom, Popper, droll, morphdom, slideToggle, chalk, yaml, chevrotain, gzipSync, gzip, sha256 };
export default { lodash, Fuse, DOMPurify, hljs, localforage, Handlebars, css, Bowser, DiffMatchPatch, Readability, isProbablyReaderable, SVGInject,
  showdown, moment, seedrandom, Popper, droll, morphdom, slideToggle, chalk, yaml, chevrotain, gzipSync, gzip, sha256 };
