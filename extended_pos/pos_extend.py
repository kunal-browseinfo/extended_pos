# -*- coding: utf-8 -*-
##############################################################################
#
#    This module uses OpenERP, Open Source Management Solution Framework.
#    Copyright (C) 2014-Today BrowseInfo (<http://www.browseinfo.in>)
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>
#
##############################################################################
import logging
import time
from datetime import datetime

from openerp import tools
from openerp.osv import fields, osv
from openerp.tools import float_is_zero
from openerp.tools.translate import _

import openerp.addons.decimal_precision as dp
import openerp.addons.product.product

class pos_order(osv.osv):
    _inherit = 'pos.order'
    _columns = {
        'cashier_id': fields.many2one('res.cashier', 'Cashier', help="Person who uses the the cash register."), # added code
    }

    def _order_fields(self, cr, uid, ui_order, context=None):
        return {
            'name':         ui_order['name'],
            'user_id':      ui_order['user_id'] or False,
            'cashier_id':   ui_order['cashier_id'] or False,
            'session_id':   ui_order['pos_session_id'],
            'lines':        ui_order['lines'],
            'pos_reference':ui_order['name'],
            'partner_id':   ui_order['partner_id'] or False,
        }

# added code
class res_cashier(osv.osv):
    _name = 'res.cashier'
    _columns = {
        'name': fields.char('Name', required=True),
        'user_id': fields.many2one('res.users', 'User', required=True),
        'visible_in_pos': fields.boolean('Visible in the Point of Sale', help='Check if you want this cashier to appear in the Point of Sale.'),
    }
