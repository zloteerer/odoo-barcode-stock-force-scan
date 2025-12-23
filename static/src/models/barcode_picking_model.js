/** @odoo-module **/

import BarcodePickingModel from "@stock_barcode/models/barcode_picking_model";
import { patch } from "@web/core/utils/patch";

patch(
    BarcodePickingModel.prototype,
    "stock_barcode_force_scan.BarcodePickingModel",
    {
        /**
         * Override to mark lines as scanned when barcode is processed
         */
        async _processBarcode(barcode) {
            const result = await this._super(...arguments);

            // After processing, mark the selected/last scanned line as scanned
            const processedLine = this.selectedLine || this.lastScannedLine;
            if (processedLine && !processedLine.barcode_scanned) {
                processedLine.barcode_scanned = true;
                this.trigger("update");
            }

            return result;
        },

        /**
         * Override to initialize barcode_scanned flag on lines
         */
        _createLinesState() {
            const lines = this._super(...arguments);
            // Mark all lines as not scanned initially
            lines.forEach((line) => {
                if (line.barcode_scanned === undefined) {
                    line.barcode_scanned = false;
                }
            });
            return lines;
        },

        /**
         * Override to mark new lines as scanned when created via barcode
         */
        async _createNewLine(params) {
            const newLine = await this._super(...arguments);

            if (newLine) {
                // New lines created from barcode scanning should be marked as scanned
                newLine.barcode_scanned = true;
            }
            return newLine;
        },

        /**
         * Override updateLine to mark as scanned when qty_done is updated via barcode
         */
        async updateLine(line, args) {
            await this._super(...arguments);
            // If we're updating qty, mark the line as scanned
            if (args.qty_done !== undefined && !line.barcode_scanned) {
                line.barcode_scanned = true;
            }
        },
    }
);
