# Cocos Playground (extension cho Cocos Creator 3.8)

Extension cho phép chỉnh nội dung của một playable mà không phải mở lại Cocos Creator. Ví dụ: text,
số, màu, enum, hoặc file như ảnh, âm thanh, text, JSON, nhị phân.

1. Trong code game, đánh dấu property bằng `@playGroundField`.
2. Build **Web Mobile**, rồi chạy **Cocos Playground → Export playable**. Bạn được một file zip gồm
   bản build kèm `playground-manifest.json` (danh sách field và giá trị hiện tại).
3. Upload zip lên dashboard (next-playground / next-luna). Chỉnh field ở đó, xem preview, rồi export
   cho từng mạng quảng cáo bằng pnp hoặc super-html.
4. Khi game chạy, `PlayGroundField.ts` áp giá trị đã chỉnh vào component ngay trước `onLoad`.

Phần runtime (`runtime/assets/`) được mount vào project ở `db://cocos-playground/` (chỉ đọc):

| File | Dùng để |
| --- | --- |
| `PlayGroundField.ts` | Decorator `@playGroundField` và phần áp giá trị khi chạy |
| `OpenStore.ts` | `openStore()` / `gameEnd()`: mở store và báo kết thúc, chạy được với mọi mạng quảng cáo |

---

## 1. Cài đặt

- Chép thư mục `cocos-playground` vào `extensions/` của project, rồi bật trong **Extension Manager**.
- Không cần `npm install`: `dist/main.js` đã được bundle sẵn, chép thư mục là chạy.
- Khi sửa `source/`, chạy `npm install` một lần, rồi `npm run build` sau mỗi lần sửa (bước này gồm
  `tsc --noEmit` và bundle bằng esbuild).

## 2. Dùng nhanh

```ts
import { _decorator, CCInteger, CCString, Color, Component, Enum, Label, Sprite, SpriteFrame, Texture2D } from 'cc';
import { playGroundField } from 'db://cocos-playground/PlayGroundField';
import { gameEnd, openStore } from 'db://cocos-playground/OpenStore';
const { ccclass, property } = _decorator;

enum Difficulty { Easy, Normal, Hard }

@ccclass('EndCard')
export class EndCard extends Component {
    @property(Label) titleLabel: Label | null = null;
    @property(Sprite) logoSprite: Sprite | null = null;

    @playGroundField({ type: CCString, label: 'Tiêu đề', group: 'End card' })
    title = 'Play now!';

    @playGroundField({ type: CCInteger, label: 'Số lượt', group: 'Gameplay', property: { range: [1, 10, 1], slide: true } })
    moves = 5;

    @playGroundField({ type: Enum(Difficulty), label: 'Độ khó', group: 'Gameplay' })
    difficulty = Difficulty.Normal;

    @playGroundField({ type: Color, label: 'Màu nút', group: 'End card' })
    buttonColor = new Color(255, 200, 0, 255);

    @playGroundField({ type: Texture2D, label: 'Logo', group: 'End card' })
    logo: Texture2D | null = null;

    onLoad() {
        // Giá trị đã chỉnh có sẵn từ đây: được áp ngay trước onLoad.
        this.titleLabel!.string = this.title;
        if (this.logo) {
            const frame = new SpriteFrame();
            frame.texture = this.logo;
            this.logoSprite!.spriteFrame = frame;
        }
    }

    onInstallClicked() {
        openStore();
    }

    onFinished() {
        gameEnd();
    }
}
```

Field vẫn là `@property` bình thường: vẫn được serialize và vẫn hiện trong Inspector.

## 3. `@playGroundField(options)`

| Option | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `type` | có | Kiểu của field (xem mục 4). Viết `[X]` cho một danh sách. |
| `label` | | Tên hiện trên dashboard, đồng thời là tooltip trong Inspector. Mặc định là tên property. |
| `group` | | Nhóm field: là section trên dashboard và group trong Inspector. |
| `property` | | Option `@property` khác của Cocos, chuyển nguyên vẹn. Dashboard đọc thêm `range`, `min`, `max`, `step`, `slide`, `multiline` (xem mục 5). |

**Phải viết options trực tiếp trong decorator.** Extension đọc thẳng source TypeScript chứ không chạy
code, nên `type`, `label`, `group` và các giá trị trong `property` phải là giá trị viết sẵn. Không
được lấy từ biến hay hằng số khai báo nơi khác.

## 4. Các kiểu hỗ trợ

| `type` | Kind | Giá trị (JSON) | Ô nhập trên dashboard |
| --- | --- | --- | --- |
| `String`, `CCString` | `string` | `"text"` | Ô text (hoặc nhiều dòng với `multiline`) |
| `Number`, `CCFloat`, `CCInteger` | `number` | `3.5` | Ô số (hoặc thanh trượt với `slide`) |
| `Boolean`, `CCBoolean` | `boolean` | `true` | Công tắc |
| `Color` | `color` | `{ "r", "g", "b", "a" }` (0–255) | Bảng chọn màu có alpha |
| `Vec2` / `Vec3` / `Vec4` | `vec2` / `vec3` / `vec4` | `{ "x", "y", ... }` | 2–4 ô số |
| Enum số: `Enum(X)` hoặc `X` | `enum` | số | Dropdown |
| Enum chuỗi: `X` | `enum` | chuỗi | Dropdown |
| `Texture2D` | `texture2D` | file (mục 7) | Kéo thả hoặc chọn file ảnh |
| `AudioClip` | `audioClip` | file | Kéo thả hoặc chọn file audio, có trình phát |
| `TextAsset` | `textAsset` | file | Kéo thả hoặc chọn file text, xem trước nội dung |
| `JsonAsset` | `jsonAsset` | file | Kéo thả hoặc chọn file JSON, xem trước |
| `BufferAsset` | `bufferAsset` | file | Kéo thả hoặc chọn bất kỳ file nào (nhị phân) |

**Danh sách:** `type: [X]`, với X là bất kỳ kiểu nào ở trên, ví dụ `[String]`, `[Color]`,
`[Texture2D]`. Trên dashboard có nút thêm và xoá phần tử. Không hỗ trợ danh sách lồng danh sách.

**Không hỗ trợ:**

- Tham chiếu tới `Node`, `Component`, `Prefab`, `SpriteFrame`, `Material`… Với ảnh, dùng
  `Texture2D` rồi tự tạo `SpriteFrame` như ví dụ ở mục 2.
- `Size`, `Rect`, `Quat`, `Mat4`, và class tự định nghĩa hay object lồng nhau.
- Khi chạy game, decorator gặp kiểu lạ thì báo lỗi `Unsupported field type`. Lúc export, extension
  chỉ cảnh báo và bỏ qua field đó.

## 5. Ràng buộc cho dashboard

Đặt trong `property`, dùng đúng tên option của Cocos:

| Option | Tác dụng trên dashboard |
| --- | --- |
| `range: [min, max, step?]` | Giới hạn giá trị và bước nhảy |
| `min`, `max`, `step` | Như trên, từng giá trị riêng |
| `slide: true` | Thanh trượt kèm ô số (cần có cả `min` lẫn `max`) |
| `multiline: true` | Ô text nhiều dòng (cho `string`) |
| `type: CCInteger` | Chỉ nhận số nguyên |

Giá trị nằm ngoài khoảng sẽ bị kéo về trong khoảng khi rời ô nhập.

## 6. Enum

- **Enum số:** nên viết `type: Enum(X)` để Inspector của Cocos hiện dropdown. Viết `type: X`
  cũng chạy được: runtime tự bọc `Enum()`.
- **Enum chuỗi** (`enum Skin { Red = 'red' }`): viết `type: Skin`. `Enum()` của Cocos chỉ nhận số,
  nên Inspector hiện một ô text, còn dashboard vẫn hiện dropdown.
- **Giá trị của member** được tính như TypeScript: tự tăng, số âm (`A = -1`), biểu thức hằng
  (`1 << 2`, `A | B`), hoặc tham chiếu member trước đó (`B = A + 1`).
- **Nơi khai báo:** enum phải nằm trong một file `.ts` dưới `assets/`. Member có giá trị không tính
  được lúc build (ví dụ gọi hàm) sẽ bị bỏ qua, kèm cảnh báo.

## 7. Field kiểu file

| Kind | File nhận | Lưu kèm build dưới dạng | Game nhận được |
| --- | --- | --- | --- |
| `texture2D` | PNG, JPEG, WebP (kiểm tra theo nội dung file) | `.png` / `.jpg` / `.webp` | `Texture2D` |
| `audioClip` | MP3, OGG, WAV, M4A, AAC | giữ đuôi | `AudioClip` (Web Audio) |
| `textAsset` | Bất kỳ file text UTF-8 nào | `.txt` | `TextAsset` (`.text`) |
| `jsonAsset` | JSON hợp lệ | `.json` | `JsonAsset` (`.json`) |
| `bufferAsset` | Bất kỳ file nào | `.bin` (super-html/pnp tự chuyển sang base64 khi đóng gói) | `BufferAsset` (`.buffer()`) |

- **Kéo thả** file vào ô của field, hoặc bấm vào ô để mở hộp thoại chọn file. File được upload ngay,
  tối đa 20 MB mỗi file, và lưu theo nội dung (sha256) nên dùng chung được giữa nhiều playable.
- **Khi export**, file nằm trong build ở `pgfiles/<sha256>.<ext>`, cả pnp, super-html lẫn packer
  của next-luna. Preview của dashboard phục vụ file ở cùng đường dẫn đó.
- **File được nạp xong trước khi vào scene đầu tiên.** Script của project được nạp trong lúc
  `game.init()`, và engine chờ `game.onPostProjectInitDelegate` trước khi chạy scene. Vì vậy trong
  `onLoad` field đã có sẵn asset mới.
- **Script nạp muộn** (bundle tải sau khi game đã chạy): file được gán ngay khi tải xong, sau
  `onLoad`, kèm cảnh báo trong console.
- **File tải lỗi:** field giữ asset gốc của build, kèm lỗi trong console.
- **Danh sách file** có thể trộn file mới với asset sẵn có trong build. Asset sẵn có được lưu là
  `{ "uuid": "..." }` và lấy lại đúng asset đó khi chạy.
- **Kích thước:** nhớ giới hạn dung lượng của mạng quảng cáo (2–5 MB). Hộp thoại Export của dashboard
  hiện dung lượng từng kênh.

### Nén tự động khi kéo file vào

Dashboard nén file ngay lúc upload, theo **loại thật của file** (đọc từ nội dung, không theo đuôi).
Bản gốc vẫn được lưu: ô field hiện mức giảm (ví dụ `−65% compressed from 2.19 MB`), có nút **Use
original** để dùng lại bản gốc và nút **Compress** để nén lại.

| Field | File | Cách nén |
| --- | --- | --- |
| `texture2D` | PNG / JPEG / WebP | Bộ nén ảnh của dashboard (palette PNG / mozjpeg / WebP, quality 80, có chốt chặn chất lượng). Ảnh nào không nén được mà không xấu đi thì giữ nguyên. |
| `jsonAsset` | JSON | Minify (cùng giá trị, bỏ khoảng trắng). |
| `bufferAsset` | FBX nhị phân | Chỉ giữ phần dựng mesh (xem bên dưới). |
| `bufferAsset` | FBX ASCII | Không nén. Hãy export lại dạng binary, vì parser lúc chạy chỉ đọc FBX nhị phân. |
| `bufferAsset` khác, `audioClip`, `textAsset` | — | Giữ nguyên. |

**FBX (cho game tự đọc FBX lúc chạy, như ModelLoader):**

- **Chỉ giữ phần mesh:** node (`Model`, kèm transform), geometry dạng mesh (vertex, index, normal,
  tối đa 2 bộ UV, màu vertex), slot material của từng mặt (mesh vẫn tách sub-mesh như cũ), đơn vị và
  trục (`GlobalSettings`), và các liên kết giữa chúng.
- **Bỏ:** material, texture, ảnh nhúng, animation, skin/pose, attribute camera/light, tangent và
  binormal, các bộ UV từ bộ thứ 3, cùng các layer khác.
- **Đổi định dạng số:** double sang float32 (GPU cũng dùng float32), rồi lượng tử hoá:
  - vị trí: 1/65536 kích thước mesh;
  - normal: 1/1024;
  - UV: 1/8192;
  - màu: 1/256.
- **Nén lại mảng:** mọi mảng được nén zlib ở mức cao nhất.
- **Kết quả đo trên `_obstacleContainer.fbx` của ModelLoader:** file từ 2,19 MB còn 786 KB (−65%);
  playable AppLovin từ 4,4 MB còn 2,9 MB (−35%).
  - Sai số lớn nhất: vị trí 0,02 mm, normal 0,05°, UV 0,125 px trên texture 2048.
  - Ảnh render trong game: chỉ 0,003% số pixel khác.
- **Không dùng được trong Cocos Creator:** file đã nén là FBX hợp lệ cho parser lúc chạy, nhưng đã
  mất material, texture, tangent và UV phụ. Đừng import nó vào Cocos Creator làm asset. Nếu game cần
  normal map (tangent) hoặc UV thứ 3, hãy bấm **Use original**.

Ví dụ dùng các asset trong code:

```ts
@playGroundField({ type: AudioClip, label: 'Nhạc nền' }) bgm: AudioClip | null = null;
@playGroundField({ type: JsonAsset, label: 'Cấu hình level' }) levels: JsonAsset | null = null;
@playGroundField({ type: TextAsset, label: 'Lời thoại' }) dialog: TextAsset | null = null;
@playGroundField({ type: BufferAsset, label: 'Dữ liệu map' }) map: BufferAsset | null = null;

onLoad() {
    this.getComponent(AudioSource)!.clip = this.bgm;
    const config = this.levels?.json as { speed: number } | null;
    const lines = this.dialog?.text.split('\n') ?? [];
    const bytes = this.map ? new Uint8Array(this.map.buffer()) : null;
}
```

## 8. Giá trị chung cho mọi node và giá trị riêng từng node

Mỗi lần component được đặt lên một node trong scene hoặc prefab là một **instance**. Trên dashboard,
mỗi field có một giá trị chung cho mọi instance, và mục **Per node** để chỉnh riêng từng instance.
Field nào không chỉnh sẽ giữ giá trị trong build.

Key của giá trị, ưu tiên từ cụ thể nhất:

| Key | Áp cho |
| --- | --- |
| `<Class>.<property>@<a/b/c>` | Component có đường dẫn node **kết thúc bằng** `a/b/c`. Nếu nhiều key khớp, key có đường dẫn dài nhất thắng. |
| `<Class>.<property>` | Mọi instance của class đó |
| `<property>` | Mọi field cùng tên, ở bất kỳ class nào (định dạng cũ, vẫn chạy) |

**Đường dẫn node** là tên các node tính từ gốc, nối bằng `/`, không gồm node Scene:

- **Node trong scene:** tính từ gốc scene, ví dụ `Canvas/EndCard/Title`.
- **Node trong prefab:** tính từ node gốc của prefab, ví dụ `Coin/Label`. Vì so khớp theo phần cuối
  đường dẫn, giá trị riêng đặt cho node trong prefab áp cho node đó ở **mọi** bản prefab trong scene.
  Nếu bản prefab trong scene bị đổi tên node gốc, nó không khớp nữa và chỉ nhận giá trị chung.
- **Tên class** là tên trong `@ccclass('...')`.

## 9. Mở store và báo kết thúc game

```ts
import { gameEnd, openStore } from 'db://cocos-playground/OpenStore';
openStore(); // nút Install / Play now / CTA
gameEnd();   // win, lose hoặc end card
```

| Cách xuất | Được nối tới |
| --- | --- |
| Dashboard: pnp hoặc super-html | `super_html.download()` / `game_end()` gốc của super-html cho mạng quảng cáo đó |
| Build thẳng bằng extension super-html | `window.super_html.download()` / `game_end()` có sẵn trong trang |
| Preview trên dashboard | Bộ đếm *Click on CTA* / *Game Ended* |
| Build thường, không có gì | Chỉ in cảnh báo (`openStore`); `gameEnd` không làm gì |

Link store đặt ở Application trên dashboard. Không cần gọi API của từng mạng quảng cáo trong code
game.

## 10. Export từ Cocos Creator

1. **Build** cho platform **Web Mobile**, xuất vào `build/web-mobile` (thư mục mặc định).
2. Chạy menu **Cocos Playground → Export playable**. Bạn được
   `build/cocos-playground-export/playable-<thời gian>.zip`, gồm `web-mobile/` và
   `playground-manifest.json`.
3. **Upload** zip này khi tạo concept, hoặc ở mục Build của concept.

Lệnh Export không tự build: luôn build lại trước khi export, để manifest khớp với code và scene hiện
tại.

**Extension đọc những gì:**

- **Script:** mọi file `.ts` dưới `assets/`, để tìm `@ccclass` và `@playGroundField`.
- **Scene:** chỉ scene khởi động của bản build, lấy từ `build/web-mobile/src/settings.json`.
- **Prefab:** mọi `.prefab` dưới `assets/`.
- **Asset:** các file `.meta`, để biết tên và đường dẫn asset của field file; cùng file trong
  `build/web-mobile/assets/*/native/` để dashboard xem trước ảnh và audio gốc.

## 11. Preview và giá trị live

- **Giá trị chưa lưu:** preview trên dashboard chạy bản build gốc, và gửi giá trị chưa lưu qua
  `?pgvo=` (base64 của JSON). Bấm Refresh hoặc Save để thấy giá trị mới.
- **Giá trị live:** mỗi 250 ms, preview gửi về giá trị hiện tại của từng field trên từng node, hiện
  dưới mỗi field. Nút **Use** chép giá trị live vào editor (không áp dụng cho field file).

## 12. Giới hạn và lưu ý

- **Chỉ áp một lần, trước `onLoad`.** Code game nên đọc field trong `onLoad` hoặc `start`. Đổi giá
  trị trong lúc game chạy thì dashboard không theo dõi.
- **Field kế thừa:** field khai báo ở class cha không được quét cho class con. Hãy khai báo
  `@playGroundField` trên đúng class gắn vào node.
- **Tên `@ccclass` phải là duy nhất** trong các class có `@playGroundField`.
- **Override của bản prefab trong scene không được đọc làm giá trị mặc định.** Dashboard hiện giá
  trị trong file `.prefab`; khi chạy, bản prefab vẫn dùng giá trị override của nó cho tới khi bạn
  chỉnh field trên dashboard.
- **Nhiều scene:** extension chỉ quét scene khởi động (và mọi prefab). Field nằm trong scene khác
  không có trên dashboard, nhưng key theo class vẫn áp được khi scene đó chạy.
- **Script phải có `.meta`.** Cocos tự tạo file này. Nếu thiếu, component được nhận diện theo tên
  property, kèm cảnh báo.
- **Không bật "Use Compressed Scene Data".** Khi bật, file scene/prefab không còn là JSON và sẽ bị
  bỏ qua, kèm cảnh báo.
- **Mọi người xem được giá trị.** Payload chỉ được base64 để không lộ khi xem source, không phải để
  bảo mật: ai cũng đọc được bằng devtools.

## 13. Cảnh báo khi export

| Cảnh báo | Ý nghĩa và cách xử lý |
| --- | --- |
| `... is missing an options object` | Decorator thiếu `{ ... }`: viết `@playGroundField({ type: X })`. |
| `... has no resolvable "type"` | `type` không phải tên kiểu viết trực tiếp. |
| `... references unknown type "X"` | Kiểu không hỗ trợ, hoặc enum không nằm dưới `assets/`. |
| `enum X.Y: value is not a compile-time constant` | Member enum có giá trị tính lúc chạy: viết giá trị cụ thể. |
| `two @ccclass classes are named "X"` | Đổi tên một trong hai class. |
| `a component of unknown type "..."` | Script không có `.meta`, hoặc nằm ngoài `assets/`. |
| `Failed to parse ... as JSON` | Scene đang nén ("Use Compressed Scene Data"). |

## 14. Định dạng dữ liệu (cho người làm dashboard)

`playground-manifest.json`, phiên bản 2. Mỗi lần component được đặt lên một node là một phần tử:

```jsonc
{
  "version": 2,
  "generatedAt": "2026-10-05T04:30:00.000Z",
  "fields": [
    {
      "key": "EndCard.logo@Canvas/EndCard",   // key cho đúng instance này
      "classKey": "EndCard.logo",             // key cho mọi instance
      "scene": "scenes/Main.scene",           // file .scene / .prefab, tính từ assets/
      "source": "scene",                      // "scene" | "prefab"
      "nodePath": "Canvas/EndCard",
      "componentType": "EndCard",
      "propertyKey": "logo",
      "label": "Logo",
      "kind": "texture2D",
      "group": "End card",
      "isList": false,
      "enumOptions": [{ "label": "Easy", "value": 0 }],      // enum: value là số hoặc chuỗi
      "constraints": { "min": 1, "max": 10, "step": 1, "slide": true, "multiline": true, "integer": true },
      "value": { "uuid": "…@6c48a", "name": "logo", "path": "textures/logo.png", "buildPath": "assets/main/native/ab/….png" }
    }
  ]
}
```

Giá trị đã chỉnh là một object với key như ở mục 8. Bản export nhận object này qua
`window.__pgvo__`; preview nhận nó qua `?pgvo=` (base64 của JSON UTF-8):

```jsonc
{
  "EndCard.title": "Tải ngay!",
  "EndCard.title@Canvas/EndCardB": "Chơi tiếp",
  "EndCard.logo": { "file": "<sha256>.png", "kind": "texture2D", "name": "logo-new.png", "size": 1234 },
  "EndCard.frames": [{ "uuid": "…@6c48a" }, { "file": "<sha256>.png", "kind": "texture2D", "name": "f2.png", "size": 99 }],
  "EndCard.bgm": null   // null: để trống field
}
```

Phiên bản 1 (cũ) thiếu `key` / `classKey` / `source`, và `nodePath` bắt đầu bằng tên scene. Dashboard
tự bổ sung các trường này. Giá trị cũ dạng `{ "<property>": value }` vẫn chạy.

## 15. Cấu trúc mã

```
runtime/assets/PlayGroundField.ts   decorator và phần áp giá trị (chạy trong game)
runtime/assets/OpenStore.ts         openStore() / gameEnd()
source/main.ts                      các lệnh menu
source/export.ts                    Export playable: quét, tạo manifest, zip build
source/analysis/scanDecorators.ts   đọc @ccclass / @playGroundField / enum từ source TS
source/analysis/scanScenes.ts       đọc giá trị từ .scene / .prefab
source/analysis/assets.ts           uuid nén, .meta, file native trong build
source/analysis/types.ts            định dạng manifest
```
