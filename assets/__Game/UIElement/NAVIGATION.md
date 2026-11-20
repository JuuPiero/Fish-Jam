# UINavigation: điều hướng màn hình (stack, tab, modal)

Hệ thống chuyển màn cho UIElement, cách dùng giống **React Navigation** hay **Vue Router**:

- **Stack**: đẩy màn mới đè lên (push), quay lại (back) với hiệu ứng trượt.
- **Tabs**: thanh tab, mỗi tab một màn; tab đã mở được giữ nguyên trạng thái.
- **Modal**: dialog, bottom sheet, fullscreen nằm trên mọi thứ, và **trả về kết quả** (`await present(...)`).
- Các navigator **lồng vào nhau** được: tabs nằm trong stack, stack nằm trong modal...

Đọc [README.md](README.md) trước nếu chưa biết cách dùng `UIDocument`.

Ví dụ đầy đủ: [assets/NavDemo/](../NavDemo/) (tabs Chơi / Shop / Hồ sơ, màn Level, Cài đặt, dialog xác nhận, sheet nhận quà).

---

## Mục lục

- [Phần 1: App 2 màn đầu tiên](#phần-1-app-2-màn-đầu-tiên)
- [Phần 2: Thêm tabs](#phần-2-thêm-tabs)
- [Phần 3: Modal và kết quả trả về](#phần-3-modal-và-kết-quả-trả-về)
- [Phần 4: Các việc hay làm](#phần-4-các-việc-hay-làm)
- [Phần 5: Xử lý lỗi thường gặp](#phần-5-xử-lý-lỗi-thường-gặp)
- [Tra cứu nhanh](#tra-cứu-nhanh)

---

## Phần 1: App 2 màn đầu tiên

Mục tiêu: màn **Home** có nút mở màn **Settings**, và màn Settings có nút quay lại.

### Bước 1: Mỗi màn là một `<template>`

Trong file HTML của `UIDocument` (ví dụ `App.html`):

```html
<template id="home">
    <h1>Home</h1>
    <button data-nav="push:settings">Cài đặt</button>
</template>

<template id="settings">
    <header>
        <button data-nav="back">‹ Quay lại</button>
        <h1>Cài đặt</h1>
    </header>
</template>
```

- `id` của template **trùng với tên route** (`home`, `settings`).
- `data-nav="push:settings"` mở màn `settings`, còn `data-nav="back"` quay lại. Không cần viết code.

### Bước 2: CSS

```css
/* Mọi màn đều có class .nav-screen; nên có nền đặc để không thấy màn dưới khi trượt */
.nav-screen { background: #141a2e; }

/* Mỗi màn còn có class .screen-<tên route> để style riêng */
.screen-home { align-items: center; justify-content: center; gap: 24px; }
```

Mỗi màn mặc định đã là `display: flex; flex-direction: column`, phủ kín vùng chứa.

### Bước 3: Khai báo navigation trong script

```ts
import { _decorator, Component } from 'cc';
import { UIDocument } from '../UIElement/Scripts/UIDocument';
import { stack, UINavigation, UIScreen } from '../UIElement/Scripts/UINavigation';
const { ccclass, requireComponent } = _decorator;

class HomeScreen extends UIScreen { }
class SettingsScreen extends UIScreen { }

@ccclass('App')
@requireComponent(UIDocument)
export class App extends Component {
    private navigation: UINavigation | null = null;

    start() {
        const doc = this.getComponent(UIDocument)!;
        this.navigation = new UINavigation(doc, {
            root: stack({
                home: HomeScreen,          // route đầu tiên = màn mở đầu
                settings: SettingsScreen,
            }),
        });
    }

    onDestroy() {
        this.navigation?.destroy();
    }
}
```

Màn không có logic gì có thể dùng thẳng `UIScreen`: `settings: UIScreen`.

### Bước 4: Gắn vào scene và chạy

1. Node có `UIDocument` (Html Asset = `App.html`, Style Sheets = `App.css`) và component `App`.
2. Preview bằng **Browser**. Bấm "Cài đặt" thì màn trượt vào từ phải, bấm "Quay lại" hoặc phím **Esc** thì trượt ra.

### Bước 5: Thêm logic cho màn

Viết logic trong class của màn. Các hàm `q`, `on`, `bind`... **chỉ tác động trong màn đó**:

```ts
class HomeScreen extends UIScreen {
    onMount() {                         // DOM đã sẵn sàng: gắn sự kiện, binding
        this.onClick('.btn-start', () => this.navigate('settings'));
    }
    onFocus() { console.log('Home đang hiển thị'); }
    onBlur()  { console.log('Màn khác đè lên Home'); }
}
```

Vòng đời của một màn:

```
onMount ─► onFocus ◄─► onBlur ─► onUnmount
            (đổi qua lại khi màn khác đè lên / modal mở / đổi tab)
```

| Hook | Khi nào chạy |
|---|---|
| `onMount()` | Màn vừa được tạo, DOM đã gắn vào trang |
| `onFocus()` | Màn trở thành màn đang hiển thị (sau hiệu ứng chuyển) |
| `onBlur()` | Màn khác hoặc modal đè lên, hoặc đổi sang tab khác |
| `onUnmount()` | Màn bị gỡ (pop, reset, đóng modal) |
| `onParams(params)` | Điều hướng lại tới màn này với tham số mới |
| `onBack()` | Có yêu cầu quay lại. Trả `true` để chặn |

---

## Phần 2: Thêm tabs

Mục tiêu: màn chính có 3 tab và thanh tiền tệ ở trên, bấm vào màn chơi thì đẩy màn **Level** đè lên cả tabs.

### Bước 1: Template khung tabs

Khung tabs cũng là một template, có:
- các nút `data-nav="tab:<tên>"`;
- một phần tử `data-outlet`, là chỗ hiển thị nội dung tab.

```html
<template id="main-tabs">
    <header class="topbar">Xu: <span data-bind="coins"></span></header>
    <main data-outlet></main>
    <nav class="tabbar">
        <button class="tab" data-nav="tab:play">Chơi</button>
        <button class="tab" data-nav="tab:shop">Shop</button>
        <button class="tab" data-nav="tab:profile">Hồ sơ</button>
    </nav>
</template>

<template id="play">...</template>
<template id="shop">...</template>
<template id="profile">...</template>
<template id="level">...</template>
```

Nút tab đang chọn **tự có class `is-active`**:

```css
.tab { color: #8f9bc4; }
.tab.is-active { color: #4f8cff; }
```

### Bước 2: Lồng tabs vào stack

```ts
this.navigation = new UINavigation(doc, {
    root: stack({
        main: tabs({ play: PlayScreen, shop: ShopScreen, profile: ProfileScreen }, { template: 'main-tabs' }),
        level: LevelScreen,
    }),
});
```

### Bước 3: Mở màn Level từ trong một tab

```ts
class PlayScreen extends UIScreen {
    onMount() {
        this.onClick('.level-cell', (_ev, cell) => {
            this.navigate('level', { level: Number(cell.dataset.level) });
        });
    }
}
```

`navigate()` **tự tìm lên trên**: tabs không có route `level`, nên nó hỏi tiếp stack cha, và stack đẩy màn Level đè lên toàn bộ tabs (giống React Navigation).

Màn Level đọc tham số qua `this.params`:

```ts
class LevelScreen extends UIScreen<{ level: number }> {
    onMount() {
        this.bind(this.params);                 // <span data-bind="level"></span>
    }
}
```

---

## Phần 3: Modal và kết quả trả về

### Bước 1: Khai báo modal

```html
<template id="confirm">
    <h3 data-bind="title"></h3>
    <p data-bind="message"></p>
    <button data-nav="close">Huỷ</button>
    <button data-action="ok">Đồng ý</button>
</template>
```

```ts
class ConfirmDialog extends UIScreen<{ title: string; message: string }> {
    static options: ScreenOptions = { presentation: 'dialog' };   // 'dialog' | 'sheet' | 'fullscreen'

    onMount() {
        this.bind(this.params);
        this.onAction('ok', () => this.close(true));   // kết quả trả về
    }
}

new UINavigation(doc, {
    root: stack({ ... }),
    modals: { confirm: ConfirmDialog },
});
```

```css
.screen-confirm { width: 560px; padding: 32px; border-radius: 24px; background: #1f2742; }
```

Modal là một **hộp**, không phải trang, nên tự đặt kích thước và nền cho nó.

### Bước 2: Mở modal và đợi kết quả

```ts
const ok = await this.present<boolean>('confirm', { title: 'Mua kiếm', message: 'Giá 80 xu?' });
if (ok) store.coins -= 80;
```

| Cách đóng modal | `present()` trả về |
|---|---|
| `this.close(value)` trong modal | `value` |
| Nút `data-nav="close"` | `undefined` (hoặc chuỗi trong `data-result="..."`) |
| Bấm nền mờ, phím Esc | `undefined` |

| `presentation` | Hiển thị |
|---|---|
| `dialog` (mặc định) | Hộp giữa màn hình, phóng to dần |
| `sheet` | Trượt lên từ đáy, rộng toàn màn |
| `fullscreen` | Trượt lên phủ kín; bấm nền **không** đóng |

Mở modal không cần code: `<button data-nav="modal:reward" data-params='{"amount": 50}'>`.

---

## Phần 4: Các việc hay làm

### Chia sẻ dữ liệu giữa các màn (store)

Tạo **một** object bằng `reactive()` và `bind` nó ở mọi màn cần. Sửa ở đâu thì mọi màn đang hiển thị dữ liệu đó đều tự cập nhật:

```ts
import { reactive } from '../UIElement/Scripts/UIBinding';

export const store = reactive({ coins: 120, level: 1, owned: [] as string[] });

class MainTabs extends UITabs { onMount() { this.bind(store); } }   // header hiện xu
class ShopScreen extends UIScreen {
    onMount() {
        this.bind(store);
        this.onAction('buy', () => store.coins -= 50);               // header cũng đổi theo
    }
}
```

Trong tabs ở trên dùng `screen: MainTabs`: `tabs({...}, { template: 'main-tabs', screen: MainTabs })`.

### Điều hướng bằng HTML (`data-nav`)

| `data-nav` | Tác dụng |
|---|---|
| `back` | Quay lại (pop stack gần nhất, hoặc đóng modal) |
| `push:shop` | Đẩy màn `shop` vào stack gần nhất |
| `navigate:shop` | Tới `shop` ở navigator gần nhất có route đó |
| `replace:shop` | Thay màn trên cùng bằng `shop` |
| `reset:home` | Xoá cả stack, chỉ còn `home` |
| `pop-to-top` | Về màn đầu tiên của stack |
| `tab:shop` | Chuyển sang tab `shop` |
| `modal:confirm` | Mở modal `confirm` |
| `close` | Đóng modal chứa nút này (`data-result="..."` để trả giá trị) |

Truyền tham số: `data-params='{"level": 3}'` (JSON, dùng dấu nháy đơn bên ngoài).

### Điều hướng bằng code

```ts
this.navigate('level', { level: 3 });   // tự tìm navigator phù hợp
this.goBack();
this.stack!.push('level', { level: 3 }, { animation: 'fade' });
this.stack!.replace('result');
this.stack!.popToTop();
this.tabs!.jumpTo('shop');
await this.present('confirm', {...});
this.close(result);
```

Từ ngoài màn (ví dụ code game Cocos), dùng chính object `UINavigation`:

```ts
this.navigation.navigate('level', { level: 1 });
this.navigation.present('reward', { amount: 20 });
this.navigation.goBack();
```

### Đổi hiệu ứng chuyển màn

```ts
// Cho cả stack
stack({ ... }, { animation: 'fade' });               // 'slide' | 'slide-up' | 'fade' | 'none'
// Cho một màn
class ResultScreen extends UIScreen { static options: ScreenOptions = { animation: 'slide-up' }; }
// Cho một lần push
this.stack!.push('result', undefined, { animation: 'none' });
// Tabs
tabs({ ... }, { animation: 'none' });                 // 'fade' (mặc định) | 'none'
```

### Chặn nút quay lại (ví dụ đang chơi dở)

```ts
class GameScreen extends UIScreen {
    onBack() {
        this.present('confirm', { title: 'Thoát?', message: 'Tiến trình sẽ mất' }).then(ok => {
            if (ok) this.stack!.pop();    // pop() trực tiếp, không qua onBack nữa
        });
        return true;                      // chặn lần back này
    }
}
```

### HUD trong suốt nằm trên game

Mặc định mỗi màn **chặn chạm** xuống game. Với màn HUD trong suốt:

```ts
class HudScreen extends UIScreen {
    static options: ScreenOptions = { pickingMode: 'ignore' };   // nền cho chạm xuyên, nút vẫn bấm được
}
```

```css
.screen-hud { background: transparent; }
```

### Mỗi màn một file HTML

Khi app lớn, tách template ra nhiều file (`home.html`, `shop.html`...) rồi kéo chúng vào danh sách **Templates** của `UIDocument`. Nội dung các file được nối sau Html Asset. CSS thì chia tương tự vào **Style Sheets**.

### Theo dõi màn hiện tại (analytics, âm thanh...)

```ts
this.navigation.onChange(nav => {
    console.log(nav.path.join(' > '));     // ví dụ "main > shop > confirm"
    console.log(nav.current.name);         // màn đang focus
});
```

### Khung chung cho cả stack (header cố định)

Stack cũng nhận `template` có `data-outlet`, giống tabs:

```html
<template id="shop-flow">
    <header class="shop-header">Shop</header>
    <div data-outlet></div>
</template>
```

```ts
shopFlow: stack({ list: ShopList, detail: ShopDetail }, { template: 'shop-flow' }),
```

### Hiệu ứng viết bằng `<script>` trong màn

Thẻ `<script>` đặt trong template của màn sẽ chạy **mỗi lần màn được tạo**, ngay trước `onMount`. Trong script, `screen` là màn đó và `root` là phần tử gốc của màn:

```html
<template id="win">
    <canvas class="fx" picking-mode="ignore"></canvas>
    <h1>Thắng rồi!</h1>
    <button data-nav="back">Tiếp</button>
    <script>
        const ctx = root.querySelector('.fx').getContext('2d');
        let time = 0;
        loop(dt => {
            if (!screen.isFocused) return;      // màn đang bị che thì khỏi vẽ
            time += dt;
            // ... vẽ particle bằng ctx
        });
        exports.burst = () => { time = 0; };
    </script>
</template>
```

```ts
class WinScreen extends UIScreen {
    onFocus() {
        this.exports.burst();                   // hàm do <script> của màn gán vào
    }
}
```

Khi màn bị gỡ (pop, reset, đóng modal), sau `onUnmount` thì `loop` dừng và các hàm `onDispose` được gọi. Màn bị che trong stack hoặc tab đang ẩn thì `loop` **vẫn chạy**, nên kiểm tra `screen.isFocused` nếu không cần vẽ lúc đó. Danh sách đầy đủ các biến có sẵn: xem [README](README.md#viết-js-ngay-trong-file-html-particle-hiệu-ứng-nhỏ).

---

## Phần 5: Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Warning `<template id="x"> not found` | Thiếu template hoặc sai `id` | `id` phải trùng tên route, hoặc đặt `template` trong options |
| Màn trống, chỉ thấy nền | Template nằm trong file chưa được nạp | Thêm file vào **Templates** của `UIDocument` |
| Khi trượt thấy màn dưới xuyên qua | Màn không có nền | `.nav-screen { background: ... }` |
| Nội dung tab không cuộn được | Phần tử cuộn thiếu `flex: 1; min-height: 0` | Thêm vào phần tử có `overflow-y: auto` |
| `navigate('x')` báo không tìm thấy route | Không navigator nào phía trên có `x`, và cũng không có modal tên `x` | Kiểm tra tên route; `navigate` chỉ tìm **lên trên**, không tìm xuống navigator con |
| `data-bind` trong màn không hiện | Chưa gọi `this.bind(...)` trong màn | Mỗi màn có binding riêng; dùng store `reactive()` để chia sẻ |
| `doc.bind()` không cập nhật chữ trong màn | Binding của document không đụng vào nội dung màn (cố ý) | Gọi `this.bind(store)` trong màn |
| Bấm nhanh liên tục nhưng không có tác dụng | Đang chạy hiệu ứng chuyển màn | Cố ý: các thao tác được xếp hàng, chạm bị chặn trong lúc chuyển |
| Game không nhận chạm | Màn đang chặn chạm | `pickingMode: 'ignore'` cho màn HUD |
| UI mất sau `doc.reload()` | `reload()` dựng lại toàn bộ DOM | Không dùng `reload()` khi đang có navigation |

---

## Tra cứu nhanh

### Khai báo

```ts
new UINavigation(doc, {
    root: stack({
        main: tabs({ play: Play, shop: Shop }, { template: 'main-tabs', initial: 'play', animation: 'fade', screen: MainTabs }),
        level: Level,
        about: { screen: UIScreen, options: { template: 'about-page', animation: 'slide-up' } },
    }, { initial: 'main', animation: 'slide' }),
    modals: { confirm: Confirm, reward: Reward },
    escapeToGoBack: true,
});
```

### `ScreenOptions` (`static options`, options của route, hoặc tham số khi push/present)

| Option | Giá trị | Mặc định |
|---|---|---|
| `template` | id của `<template>` | tên route (navigator: không có) |
| `animation` | `slide`, `slide-up`, `fade`, `none` | `slide` |
| `presentation` | `dialog`, `sheet`, `fullscreen` | `dialog` |
| `dismissOnBackdrop` | `true` / `false` | `true` (trừ `fullscreen`) |
| `pickingMode` | `position` / `ignore` | `position` (navigator: `ignore`) |

### `UIScreen`

| Thành phần | Mô tả |
|---|---|
| `name`, `params`, `root` | Tên route, tham số, phần tử gốc |
| `navigation`, `navigator`, `stack`, `tabs` | Navigation, navigator cha, stack/tabs gần nhất |
| `isFocused`, `isModal` | Trạng thái |
| `q`, `qAll`, `on`, `onClick`, `onAction` | Truy vấn và sự kiện **trong màn này** |
| `bind(data)` | Binding riêng của màn |
| `exports` | Hàm/giá trị do `<script>` trong template của màn gán vào |
| `instantiate(id)` | Clone template |
| `navigate`, `goBack`, `present`, `close` | Điều hướng |

### `UIStack` / `UITabs`

| Stack | Tabs |
|---|---|
| `push(name, params?, options?)` | `jumpTo(name, params?)` |
| `pop(count?)`, `popToTop()` | `activeName` |
| `replace(name, params?)`, `reset(name, params?)` | |
| `canGoBack()`, `routeNames` | |

### `UINavigation`

| Thành phần | Mô tả |
|---|---|
| `navigate`, `goBack`, `present`, `dismiss` | Điều hướng từ màn đang focus |
| `current`, `path`, `root`, `isBusy` | Trạng thái |
| `onChange(cb)` | Gọi sau mỗi lần điều hướng |
| `destroy()` | Gỡ toàn bộ (gọi trong `onDestroy`) |

### Class CSS có sẵn

| Class | Gắn vào |
|---|---|
| `.nav-screen` | Mọi màn |
| `.screen-<route>` | Màn có route đó |
| `.is-active` | Nút `data-nav="tab:..."` của tab đang chọn |
| `.nav-modal--dialog/sheet/fullscreen` | Lớp bọc modal |
| `.nav-backdrop` | Nền mờ của modal (màu: biến `--nav-backdrop`) |
