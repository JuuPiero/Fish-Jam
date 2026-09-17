import super_html_playable from "./super_html_playable";
import { ETrackingEvent, TrackingManager } from "./TrackingManager";

const APPLE_STORE = ""
const GOOGLE_PLAY_STORE = ""


export class PlayableAdsManager {

    static SetupLinkStore() {
        super_html_playable.set_app_store_url(APPLE_STORE)
        super_html_playable.set_google_play_url(GOOGLE_PLAY_STORE)
    }

    static OpenStore() {
        super_html_playable.download()
    }

    static EndGame() {
        // TrackingManager.TrackEvent(ETrackingEvent.ENDCARD_SHOWN)
        super_html_playable.download()
        super_html_playable.game_end()
    }
}