// Browser bundle for the smoke page: the real panel app and its style.
import { createConsoleApp } from '../../source/panels/app';
import { STYLE } from '../../source/panels/style';

(window as any).createConsoleApp = createConsoleApp;
(window as any).PANEL_STYLE = STYLE;
