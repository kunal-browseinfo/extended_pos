import math
from openerp.osv import osv, fields
import openerp.addons.product.product

class res_users(osv.osv):
    _inherit = 'res.users'
    _columns = {
        'cashier_ids': fields.one2many('res.cashier', 'user_id', string='Cashier'), #added code
    }

