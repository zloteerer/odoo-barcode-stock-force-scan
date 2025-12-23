/** @odoo-module **/

import LineComponent from "@stock_barcode/components/line";
import { patch } from "web.utils";

patch(LineComponent.prototype, "stock_barcode_force_scan.LineComponent", {
    /**
     * Check if the line has been scanned
     */
    get isScanned() {
        return this.line && this.line.barcode_scanned === true;
    },

    /**
     * Override to hide increment button if not scanned
     * Cette méthode est appelée par le template original pour décider d'afficher le bouton
     */
    get getDisplayIncrementBtn() {
        // Si pas scanné, ne pas afficher le bouton
        if (!this.isScanned) {
            return false;
        }
        // Sinon, utiliser la logique d'origine
        return this.env.model.getDisplayIncrementBtn(this.line);
    },

    /**
     * Override to hide decrement button if not scanned
     */
    get getDisplayDecrementBtn() {
        // Si pas scanné, ne pas afficher le bouton
        if (!this.isScanned) {
            return false;
        }
        // Sinon, utiliser la logique d'origine
        return this.env.model.getDisplayDecrementBtn(this.line);
    },

    /**
     * Override to block manual quantity changes before scan
     * Cette méthode est appelée quand on clique sur +1 ou -1
     */
    addQuantity(quantity, ev) {
        if (!this.isScanned) {
            this.env.model.notification.add(
                "Vous devez d'abord scanner le code-barre du produit avant de modifier la quantité manuellement.",
                { type: "warning" }
            );
            ev.stopPropagation();
            ev.preventDefault();
            return;
        }
        // Si scanné, exécuter le comportement normal
        this._super(...arguments);
    },
});
