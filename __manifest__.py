# -*- coding: utf-8 -*-
{
    'name': "Stock Barcode Force Scan",
    'summary': "Force scanning before manual quantity changes and block unexpected products",
    'description': """
DELETE THIS MODULE WHEN UPGRADING TO ODOO 16 OR HIGHER
===========================

**Tested and developed for Odoo 15 only**

This module extends stock_barcode to add security features:
- Users cannot modify quantities manually (using +/- buttons) until the product barcode has been scanned
- Users cannot add products that are not in the expected move lines
""",
    'author': "zloteerer",
    'website': "https://github.com/zloteerer/odoo-barcode-stock-force-scan",
    'category': 'Inventory/Inventory',
    'version': '15.0.1.0.0',
    'depends': ['stock_barcode'],
    'data': [],
    'assets': {
        'web.assets_backend': [
            'stock_barcode_force_scan/static/src/**/*.js',
            'stock_barcode_force_scan/static/src/**/*.scss',
        ],
        'web.assets_qweb': [
            'stock_barcode_force_scan/static/src/**/*.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
