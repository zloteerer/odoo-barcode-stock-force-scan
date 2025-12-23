/** @odoo-module **/

import MainComponent from "@stock_barcode/components/main";
import { patch } from "@web/core/utils/patch";
import { url } from "@web/core/utils/urls";

patch(MainComponent.prototype, "stock_barcode_force_scan.MainComponent", {
    async willStart() {
        await this._super(...arguments);

        const fileExtension = new Audio().canPlayType(
            "audio/ogg; codecs=vorbis"
        )
            ? "ogg"
            : "mp3";
        this.sounds = {
            error: new Audio(
                url(
                    `/stock_barcode_force_scan/static/src/audio/error.${fileExtension}`
                )
            ),
            notify: new Audio(
                url(
                    `/stock_barcode_force_scan/static/src/audio/ting.${fileExtension}`
                )
            ),
            success: new Audio(
                url(
                    `/stock_barcode_force_scan/static/src/audio/success.${fileExtension}`
                )
            ),
        };
        this.sounds.error.load();
        this.sounds.notify.load();
        this.sounds.success.load();
        this.env.model.on("play-sound", this, this._onPlaySound);
    },

    _onPlaySound(event) {
        const sound = this.sounds[event];
        if (sound) {
            sound.currentTime = 0;
            sound.play();
        }
    },
});
