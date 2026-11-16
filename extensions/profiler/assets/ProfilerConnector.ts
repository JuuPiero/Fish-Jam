import { _decorator, Component } from 'cc';
import { DEBUG } from 'cc/env';
import { Profiler } from './Profiler';

const { ccclass, property, menu, disallowMultiple } = _decorator;

/**
 * Connects the game to the editor's Profiler (Unity's "Autoconnect
 * Profiler"). Previews and debug builds connect by themselves; use this for
 * a release build, or for a native build on a phone that needs the editor
 * machine's IP.
 */
@ccclass('ProfilerConnector')
@menu('Profiler/ProfilerConnector')
@disallowMultiple
export class ProfilerConnector extends Component {
    @property({ tooltip: 'IP of the machine running the editor (empty: the page host, then this machine).' })
    host = '';

    @property({ tooltip: 'Port of the editor\'s profiler server (0: try the default ports).' })
    port = 0;

    @property({ tooltip: 'Also connect in release builds (otherwise debug builds only).' })
    connectInRelease = false;

    onLoad(): void {
        if (!DEBUG && !this.connectInRelease) return;
        Profiler.enable({ host: this.host.trim() || undefined, port: this.port > 0 ? this.port : undefined });
    }
}
