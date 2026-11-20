import { _decorator, Component, log } from 'cc';
import { UIDocument } from '../Scripts/UIDocument';
// import super_html_playable from '../../Scripts/super_html_playable';
const { ccclass, property, requireComponent } = _decorator;

interface MenuState {
    coins: number;
    level: number;
    playerName: string;
    sound: boolean;
    playing: boolean;
}

const SHOP_ITEMS = [
    { id: 'sword', name: 'Sword', price: 30 },
    { id: 'shield', name: 'Shield', price: 50 },
    { id: 'potion', name: 'Potion', price: 10 },
];

@ccclass('MainMenuController')
@requireComponent(UIDocument)
export class MainMenuController extends Component {
    private _state: MenuState | null = null;

    start() {
        const doc = this.getComponent(UIDocument)!;

        const state = this._state = doc.bind<MenuState>({
            coins: 100,
            level: 1,
            playerName: 'Player',
            sound: true,
            playing: false,
        });

        const list = doc.q('#shop-list');
        for (const item of SHOP_ITEMS) {
            const el = doc.instantiate('shop-item');
            if (!list || !el) break;
            el.dataset.id = item.id;
            el.dataset.price = String(item.price);
            el.querySelector('.shop-name')!.textContent = `${item.name} · ${item.price}`;
            list.appendChild(el);
        }

        doc.onClick('.btn-buy', (_ev, button) => {
            const item = button.closest<HTMLElement>('.shop-item')!;
            const price = Number(item.dataset.price);
            if (item.classList.contains('owned') || state.coins < price) return;
            state.coins -= price;
            item.classList.add('owned');
            button.textContent = 'Owned';
        });

        doc.onAction('play', () => {
            state.playing = true;
            log(`[MainMenu] ${state.playerName} starts level ${state.level} (sound: ${state.sound})`);
            // super_html_playable.download();
        });

        doc.onAction('pause', () => {
            state.playing = false;
            state.level++;
            // super_html_playable.download();

        });
    }
}
