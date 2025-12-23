/** @odoo-module **/

import BarcodeModel from "@stock_barcode/models/barcode_model";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

patch(BarcodeModel.prototype, "stock_barcode_force_scan.BarcodeModel", {
    /**
     * Override to block creation of new lines for products not in the demand or when quantity is more than expected
     *
     * @param {string} barcode
     * @returns {Promise}
     */
    async _processBarcode(barcode) {
        let barcodeData = {};
        let currentLine = false;
        // Creates a filter if needed, which can help to get the right record
        // when multiple records have the same model and barcode.
        const filters = {};
        if (
            this.selectedLine &&
            this.selectedLine.product_id.tracking !== "none"
        ) {
            filters["stock.production.lot"] = {
                product_id: this.selectedLine.product_id.id,
            };
        }
        try {
            barcodeData = await this._parseBarcode(barcode, filters);
            if (
                !barcodeData.match &&
                filters["stock.production.lot"] &&
                !this.canCreateNewLot &&
                this.useExistingLots
            ) {
                // Retry to parse the barcode without filters in case it matches an existing
                // record that can't be found because of the filters
                const lot = await this.cache.getRecordByBarcode(
                    barcode,
                    "stock.production.lot"
                );
                if (lot) {
                    Object.assign(barcodeData, { lot, match: true });
                }
            }
        } catch (parseErrorMessage) {
            barcodeData.error = parseErrorMessage;
        }

        // Process each data in order, starting with non-ambiguous data type.
        if (barcodeData.action) {
            // As action is always a single data, call it and do nothing else.
            return await barcodeData.action();
        }

        if (barcodeData.packaging) {
            Object.assign(
                barcodeData,
                this._retrievePackagingData(barcodeData.packaging)
            );
        }

        if (barcodeData.lot && !barcodeData.product) {
            Object.assign(
                barcodeData,
                this._retrieveTrackingNumberInfo(barcodeData.lot)
            );
        }

        await this._processLocation(barcodeData);
        await this._processPackage(barcodeData);
        if (barcodeData.stopped) {
            // TODO: Sometime we want to stop here instead of keeping doing thing,
            // but it's a little hacky, it could be better to don't have to do that.
            return;
        }

        if (barcodeData.weight) {
            // Convert the weight into quantity.
            barcodeData.quantity = barcodeData.weight.value;
        }

        // If no product found, take the one from last scanned line if possible.
        if (!barcodeData.product) {
            if (barcodeData.quantity) {
                currentLine = this.selectedLine || this.lastScannedLine;
            } else if (
                this.selectedLine &&
                this.selectedLine.product_id.tracking !== "none"
            ) {
                currentLine = this.selectedLine;
            } else if (
                this.lastScannedLine &&
                this.lastScannedLine.product_id.tracking !== "none"
            ) {
                currentLine = this.lastScannedLine;
            }
            if (currentLine) {
                // If we can, get the product from the previous line.
                const previousProduct = currentLine.product_id;
                // If the current product is tracked and the barcode doesn't fit
                // anything else, we assume it's a new lot/serial number.
                if (
                    previousProduct.tracking !== "none" &&
                    !barcodeData.match &&
                    this.canCreateNewLot
                ) {
                    barcodeData.lotName = barcode;
                    barcodeData.product = previousProduct;
                }
                if (
                    barcodeData.lot ||
                    barcodeData.lotName ||
                    barcodeData.quantity
                ) {
                    barcodeData.product = previousProduct;
                }
            }
        }
        let { product } = barcodeData;
        if (
            !product &&
            barcodeData.match &&
            this.parser.nomenclature.is_gs1_nomenclature
        ) {
            // Special case where something was found using the GS1 nomenclature but no product is
            // used (eg.: a product's barcode can be read as a lot is starting with 21).
            // In such case, tries to find a record with the barcode by by-passing the parser.
            barcodeData = await this._fetchRecordFromTheCache(barcode, filters);
            if (barcodeData.packaging) {
                Object.assign(
                    barcodeData,
                    this._retrievePackagingData(barcodeData.packaging)
                );
            } else if (barcodeData.lot) {
                Object.assign(
                    barcodeData,
                    this._retrieveTrackingNumberInfo(barcodeData.lot)
                );
            }
            if (barcodeData.product) {
                product = barcodeData.product;
            } else if (barcodeData.match) {
                await this._processPackage(barcodeData);
                if (barcodeData.stopped) {
                    return;
                }
            }
        }
        if (!product) {
            // Product is mandatory, if no product, raises a warning.
            if (!barcodeData.error) {
                if (this.groups.group_tracking_lot) {
                    barcodeData.error = _t(
                        "You are expected to scan one or more products or a package available at the picking location"
                    );
                } else {
                    barcodeData.error = _t(
                        "You are expected to scan one or more products."
                    );
                }
            }
            this.trigger("play-sound", "error");
            return this.notification.add(barcodeData.error, {
                type: "danger",
            });
        }

        // CUSTOM: Check if product is in expected lines
        const expectedLine = this.currentState.lines.find(
            (line) =>
                line.product_id.id === product.id && line.product_uom_qty > 0
        );
        if (!expectedLine) {
            this.trigger("play-sound", "error");
            return this.notification.add(
                _t(
                    "Cannot process this product. This product is not in the expected lines."
                ),
                { type: "danger" }
            );
        }

        if (barcodeData.lot && barcodeData.lot.product_id !== product.id) {
            delete barcodeData.lot; // The product was scanned alongside another product's lot.
        }
        if (barcodeData.weight) {
            // the encoded weight is based on the product's UoM
            barcodeData.uom = this.cache.getRecord("uom.uom", product.uom_id);
        }

        // Searches and selects a line if needed.
        if (
            !currentLine ||
            this._shouldSearchForAnotherLine(currentLine, barcodeData)
        ) {
            currentLine = this._findLine(barcodeData);
        }

        // Default quantity set to 1 by default if the product is untracked or
        // if there is a scanned tracking number.
        if (
            product.tracking === "none" ||
            barcodeData.lot ||
            barcodeData.lotName ||
            this._incrementTrackedLine()
        ) {
            const hasUnassignedQty =
                currentLine &&
                currentLine.qty_done &&
                !currentLine.lot_id &&
                !currentLine.lot_name;
            const isTrackingNumber = barcodeData.lot || barcodeData.lotName;
            const defaultQuantity =
                isTrackingNumber && hasUnassignedQty ? 0 : 1;
            barcodeData.quantity = barcodeData.quantity || defaultQuantity;
            if (
                product.tracking === "serial" &&
                barcodeData.quantity > 1 &&
                (barcodeData.lot || barcodeData.lotName)
            ) {
                barcodeData.quantity = 1;
                this.notification.add(
                    _t(
                        `A product tracked by serial numbers can't have multiple quantities for the same serial number.`
                    ),
                    { type: "danger" }
                );
            }
        }

        if ((barcodeData.lotName || barcodeData.lot) && product) {
            const lotName = barcodeData.lotName || barcodeData.lot.name;
            for (const line of this.currentState.lines) {
                if (
                    line.product_id.tracking === "serial" &&
                    this.getQtyDone(line) !== 0 &&
                    ((line.lot_id && line.lot_id.name) || line.lot_name) ===
                        lotName
                ) {
                    this.trigger("play-sound", "error");
                    return this.notification.add(
                        _t("The scanned serial number is already used."),
                        { type: "danger" }
                    );
                }
            }
            // Prefills `owner_id` and `package_id` if possible.
            const prefilledOwner =
                (!currentLine || (currentLine && !currentLine.owner_id)) &&
                this.groups.group_tracking_owner &&
                !barcodeData.owner;
            const prefilledPackage =
                (!currentLine || (currentLine && !currentLine.package_id)) &&
                this.groups.group_tracking_lot &&
                !barcodeData.package;
            if (this.useExistingLots && (prefilledOwner || prefilledPackage)) {
                const lotId =
                    (barcodeData.lot && barcodeData.lot.id) ||
                    (currentLine &&
                        currentLine.lot_id &&
                        currentLine.lot_id.id) ||
                    false;
                const res = await this.orm.call(
                    "product.product",
                    "prefilled_owner_package_stock_barcode",
                    [product.id],
                    {
                        lot_id: lotId,
                        lot_name: (!lotId && barcodeData.lotName) || false,
                        context: { location_id: currentLine.location_id },
                    }
                );
                this.cache.setCache(res.records);
                if (prefilledPackage && res.quant && res.quant.package_id) {
                    barcodeData.package = this.cache.getRecord(
                        "stock.quant.package",
                        res.quant.package_id
                    );
                }
                if (prefilledOwner && res.quant && res.quant.owner_id) {
                    barcodeData.owner = this.cache.getRecord(
                        "res.partner",
                        res.quant.owner_id
                    );
                }
            }
        }

        // Updates or creates a line based on barcode data.
        if (currentLine) {
            // If line found, can it be incremented ?
            let exceedingQuantity = 0;
            if (
                product.tracking !== "serial" &&
                barcodeData.uom &&
                barcodeData.uom.category_id ==
                    currentLine.product_uom_id.category_id
            ) {
                // convert to current line's uom
                barcodeData.quantity =
                    (barcodeData.quantity / barcodeData.uom.factor) *
                    currentLine.product_uom_id.factor;
                barcodeData.uom = currentLine.product_uom_id;
            }
            if (this.canCreateNewLine) {
                // CUSTOM: Block if quantity exceeds remaining quantity
                if (
                    currentLine.product_uom_qty &&
                    product.tracking === "none"
                ) {
                    const remainingQty =
                        currentLine.product_uom_qty - currentLine.qty_done;
                    if (barcodeData.quantity > remainingQty) {
                        // Block the operation and show error
                        this.trigger("play-sound", "error");
                        return this.notification.add(
                            _t(
                                "Cannot add more than the expected quantity for this product."
                            ),
                            { type: "danger" }
                        );
                    }
                }
            }
            if (
                barcodeData.quantity > 0 ||
                barcodeData.lot ||
                barcodeData.lotName
            ) {
                const fieldsParams = this._convertDataToFieldsParams({
                    qty: barcodeData.quantity,
                    lotName: barcodeData.lotName,
                    lot: barcodeData.lot,
                    package: barcodeData.package,
                    owner: barcodeData.owner,
                });
                if (barcodeData.uom) {
                    fieldsParams.uom = barcodeData.uom;
                }
                await this.updateLine(currentLine, fieldsParams);
            }
        } else if (this.canCreateNewLine) {
            // CUSTOM: Block creation of new lines for products not in expected lines
            this.trigger("play-sound", "error");
            return this.notification.add(
                _t(
                    "Cannot create a new line. This product must first be scanned to be added."
                ),
                { type: "danger" }
            );
        }

        // And finally, if the scanned barcode modified a line, selects this line.
        if (currentLine) {
            this.selectLine(currentLine);
        }
        this.trigger("play-sound", "success");
        this.trigger("update");
    },

    getDisplayDecrementBtn(line) {
        return line.qty_done > 0;
    },
});
