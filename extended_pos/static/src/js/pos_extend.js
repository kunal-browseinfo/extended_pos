function extend_pos(instance, module) { //module is instance.point_of_sale
    var module = instance.point_of_sale;
    var QWeb = instance.web.qweb;
    _t = instance.web._t;

    ////////////////////////////////////////// for db operations
    var Posdb = module.PosDB;
    module.PosDB = module.PosDB.extend({
        init: function(options){
            this.cashier_sorted = [];
            this.cashier_by_id = {};
            this.cashier_search_string = "";
            this.cashier_write_date = null;
            return Posdb.prototype.init.call(this, options);
        },
        _cashier_search_string: function(cashier){
            var str =  cashier.name;
            str = '' + cashier.id + ':' + str.replace(':','') + '\n';
            return str;
        },
        add_cashiers: function(cashiers){
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = cashiers.length; i < len; i++){
                var cashier = cashiers[i];

                if (    this.cashier_write_date &&
                        this.cashier_by_id[cashier.id] &&
                        new Date(this.cashier_write_date).getTime() + 1000 >=
                        new Date(cashier.write_date).getTime() ) {
                    // FIXME: The write_date is stored with milisec precision in the database
                    // but the dates we get back are only precise to the second. This means when
                    // you read partners modified strictly after time X, you get back partners that were
                    // modified X - 1 sec ago.
                    continue;
                } else if ( new_write_date < cashier.write_date ) {
                    new_write_date  = cashier.write_date;
                }
                if (!this.cashier_by_id[cashier.id]) {
                    this.cashier_sorted.push(cashier.id);
                }
                this.cashier_by_id[cashier.id] = cashier;

                updated_count += 1;
            }

            this.cashier_write_date = new_write_date || this.cashier_write_date;

            if (updated_count) {
                // If there were updates, we need to completely
                // rebuild the search string and the ean13 indexing

                this.cashier_search_string = "";

                for (var id in this.cashier_by_id) {
                    var cashier = this.cashier_by_id[id];

                    if(cashier.ean13){
                        this.cashier_by_ean13[cashier.ean13] = cashier;
                    }
                    this.cashier_search_string += this._cashier_search_string(cashier);
                }
            }
            return updated_count;
        },
        get_cashier_write_date: function(){
            return this.cashier_write_date;
        },
        get_cashier_by_id: function(id){
            return this.cashier_by_id[id];
        },
        get_cashiers_sorted: function(max_count){
            max_count = max_count ? Math.min(this.cashier_sorted.length, max_count) : this.cashier_sorted.length;
            var cashiers = [];
            for (var i = 0; i < max_count; i++) {
                cashiers.push(this.cashier_by_id[this.cashier_sorted[i]]);
            }
            return cashiers;
        },
        search_cashier: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.cashier_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_cashier_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },

    });


    module.PosModel.prototype.models.push({
            model:  'res.cashier',
            fields: ['name','id'],
            domain: function(self){ return [['visible_in_pos','=',true]]; },
            loaded: function(self,cashiers){
                self.cashiers = [];
                for(var i = 0; i < cashiers.length; i++){
                    self.cashiers.push(cashiers[i]);
                }
                self.db.add_cashiers(self.cashiers);
            },
        });


    module.UsernameWidget.include({
        get_name: function(){
            var user;
            if(this.mode === 'cashier'){
                user = this.pos.cashier || this.pos.cashiers; //this.pos.user;
            }else{
                user = this.pos.get('selectedOrder').get_client()  || this.pos.cashiers; //this.pos.user;
            }
            if(user){
                return "";
            }else{
                return "";
            }
        },
    });

    // for set cashier search screen
    module.PosWidget.include({
        start: function() {
            var self = this;
            return self.pos.ready.done(function() {
                // remove default webclient handlers that induce click delay
                $(document).off();
                $(window).off();
                $('html').off();
                $('body').off();
                $(self.$el).parent().off();
                $('document').off();
                $('.oe_web_client').off();
                $('.openerp_webclient_container').off();

                self.renderElement();

                self.$('.neworder-button').click(function(){
                    self.pos.add_new_order();
                });

                self.$('.deleteorder-button').click(function(){
                    if( !self.pos.get('selectedOrder').is_empty() ){
                        self.screen_selector.show_popup('confirm',{
                            message: _t('Destroy Current Order ?'),
                            comment: _t('You will lose any data associated with the current order'),
                            confirm: function(){
                                self.pos.delete_current_order();
                            },
                        });
                    }else{
                        self.pos.delete_current_order();
                    }
                });

                //when a new order is created, add an order button widget
                self.pos.get('orders').bind('add', function(new_order){
                    var new_order_button = new module.OrderButtonWidgets(null, {
                        order: new_order,
                        pos: self.pos
                    });
                    new_order_button.appendTo(this.$('.orders'));
                    new_order_button.selectOrder();
                }, self);

                self.pos.add_new_order();

                self.build_widgets();

                if(self.pos.config.iface_big_scrollbars){
                    self.$el.addClass('big-scrollbars');
                }

                self.screen_selector.set_default_screen();

                self.pos.barcode_reader.connect();

                instance.webclient.set_content_full_screen(true);

                self.$('.loader').animate({opacity:0},1500,'swing',function(){self.$('.loader').addClass('oe_hidden');});

                self.pos.push_order();

            }).fail(function(err){   // error when loading models data from the backend
                self.loading_error(err);
            });
        },
        build_widgets: function() {
            var self = this;
            this._super();

            // for cashier
            this.cashier_screen = new module.CashierListScreenWidget(this, {});
            this.cashier_screen.appendTo(this.$('.screens'));

            // --------  Screen Selector ---------

            this.screen_selector = new module.ScreenSelector({
                pos: this.pos,
                screen_set:{
                    'products': this.product_screen,
                    'payment' : this.payment_screen,
                    'scale':    this.scale_screen,
                    'receipt' : this.receipt_screen,
                    'clientlist': this.clientlist_screen,
                    'cashierlist': this.cashier_screen,
                },
                popup_set:{
                    'error': this.error_popup,
                    'error-barcode': this.error_barcode_popup,
                    'error-traceback': this.error_traceback_popup,
                    'confirm': this.confirm_popup,
                    'unsent-orders': this.unsent_orders_popup,
                },
                default_screen: 'products',
                default_mode: 'cashier',
            });

        },
    });

    module.OrderButtonWidgets = module.PosBaseWidget.extend({
        template:'OrderButtonWidgets',
        init: function(parent, options) {
            this._super(parent,options);
            var self = this;

            this.order = options.order;
            this.order.bind('destroy',this.destroy, this );
            this.order.bind('change', this.renderElement, this );
            this.pos.bind('change:selectedOrder', this.renderElement,this );
        },
        renderElement:function(){
            this.selected = ( this.pos.get('selectedOrder') === this.order )
            this._super();
            var self = this;
            if (self.pos.pos_widget.cashier_screen) {
                if (!self.pos.pos_widget.cashier_screen.new_cashiers) {
                    self.order.set_cashiers(self.pos.cashiers[0]);
                } else {
                    self.order.set_cashiers(self.pos.pos_widget.cashier_screen.new_cashiers);
                }
            } else {
                self.order.set_cashiers(self.pos.cashiers[0]);
            }
            $('#cashier').click(function(){
                if( self.pos.get('selectedOrder') === self.order ){
                    var ss = self.pos.pos_widget.screen_selector;
                    if(ss.get_current_screen() === 'cashierlist'){
                        ss.back();
                    }else if (ss.get_current_screen() !== 'receipt'){
                        ss.set_current_screen('cashierlist');
                    }
                }else{
                    self.selectOrder();
                }
            });
            $('#customer').click(function(){
                if( self.pos.get('selectedOrder') === self.order ){
                    var ss = self.pos.pos_widget.screen_selector;
                    if(ss.get_current_screen() === 'clientlist'){
                        ss.back();
                    }else if (ss.get_current_screen() !== 'receipt'){
                        ss.set_current_screen('clientlist');
                    }
                }else{
                    self.selectOrder();
                }
            });
            if( this.selected){
                this.$el.addClass('selected');
            }
        },
        selectOrder: function(event) {
            this.pos.set({
                selectedOrder: this.order
            });
        },
        destroy: function(){
            this.order.unbind('destroy', this.destroy, this);
            this.order.unbind('change',  this.renderElement, this);
            this.pos.unbind('change:selectedOrder', this.renderElement, this);
            this._super();
        },
    });

    // for save cashier into pos order
    var OrderSuper = module.Order;
    module.Order = module.Order.extend({
        initialize: function(attributes){
            this.set({
                cashiers:         null,
            });
            return OrderSuper.prototype.initialize.call(this, attributes);
        },
        // the cashier related to the current order.
        set_cashiers: function(cashiers){
            this.set('cashiers',cashiers);
        },
        get_cashiers: function(){
            return this.get('cashiers');
        },
        get_cashiers_name: function(){
            var cashiers = this.get('cashiers');
            return cashiers ? cashiers.name : "";
        },
        export_as_JSON: function() {
            var orderLines, paymentLines;
            orderLines = [];
            (this.get('orderLines')).each(_.bind( function(item) {
                return orderLines.push([0, 0, item.export_as_JSON()]);
            }, this));
            paymentLines = [];
            (this.get('paymentLines')).each(_.bind( function(item) {
                return paymentLines.push([0, 0, item.export_as_JSON()]);
            }, this));
            return {
                name: this.getName(),
                amount_paid: this.getPaidTotal(),
                amount_total: this.getTotalTaxIncluded(),
                amount_tax: this.getTax(),
                amount_return: this.getChange(),
                lines: orderLines,
                statement_ids: paymentLines,
                pos_session_id: this.pos.pos_session.id,
                partner_id: this.get_client() ? this.get_client().id : false,
                user_id: this.pos.cashier ? this.pos.cashier.id : this.pos.user.id,
                cashier_id: this.get_cashiers() ? this.get_cashiers().id : false,
                uid: this.uid,
                sequence_number: this.sequence_number,
            };
        }
    });

    //for cashier screen
    module.CashierListScreenWidget = module.ScreenWidget.extend({
        template: 'CashierListScreenWidget',

        init: function(parent, options){
            this._super(parent, options);
        },

        show_leftpane: false,

        auto_back: true,
        show: function(){
            var self = this;
            this._super();

            this.renderElement();
            this.details_visible = false;
            this.old_cashiers = this.pos.get('selectedOrder').get('cashiers');
            this.new_cashiers = this.old_cashiers;

            this.$('.back').click(function(){
                self.pos.pos_widget.screen_selector.set_current_screen('products');
                //self.pos_widget.screen_selector.back();
            });

            this.$('.next').click(function(){
                self.save_changes();
                self.pos_widget.screen_selector.back();
            });

            this.$('.new-customer').click(function(){
                self.display_client_details('edit',{
                    'country_id': self.pos.company.country_id,
                });
            });

            var cashiers = this.pos.db.get_cashiers_sorted(1000);

            this.render_list(cashiers);

            this.reload_cashiers();

            if( this.old_cashiers ){
                this.display_client_details('show',this.old_cashiers,0);
            }

            this.$('.client-list-contents').delegate('.client-line','click',function(event){
                self.line_select(event,$(this),parseInt($(this).data('id')));
            });

            var search_timeout = null;

            if(this.pos.config.iface_vkeyboard && this.pos_widget.onscreen_keyboard){
                this.pos_widget.onscreen_keyboard.connect(this.$('.searchbox input'));
            }

            this.$('.searchbox input').on('keyup',function(event){
                clearTimeout(search_timeout);

                var query = this.value;

                search_timeout = setTimeout(function(){
                    self.perform_search(query,event.which === 13);
                },70);
            });

            this.$('.searchbox .search-clear').click(function(){
                self.clear_search();
            });
        },
        perform_search: function(query, associate_result){
            if(query){
                var customers = this.pos.db.search_cashier(query);
                this.display_client_details('hide');
                if ( associate_result && customers.length === 1){
                    this.new_cashiers = customers[0];
                    this.save_changes();
                    this.pos_widget.screen_selector.back();
                }
                this.render_list(customers);
            }else{
                var customers = this.pos.db.get_cashiers_sorted();
                this.render_list(customers);
            }
        },
        clear_search: function(){
            var customers = this.pos.db.get_cashiers_sorted(1000);
            this.render_list(customers);
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },
        render_list: function(cashiers){
            var contents = this.$el[0].querySelector('.client-list-contents');
            contents.innerHTML = "";
            for(var i = 0, len = Math.min(cashiers.length,1000); i < len; i++){
                var cashier    = cashiers[i];
                var clientline_html = QWeb.render('CashierLine',{widget: this, cashier:cashiers[i]});
                var clientline = document.createElement('tbody');
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];

                if( cashiers === this.new_cashiers ){
                    clientline.classList.add('highlight');
                }else{
                    clientline.classList.remove('highlight');
                }

                contents.appendChild(clientline);
            }
        },
        save_changes: function(){
            if( this.has_client_changed() ){
                this.pos.get('selectedOrder').set_cashiers(this.new_cashiers);
            }
        },
        has_client_changed: function(){
            if( this.old_cashiers && this.new_cashiers ){
                return this.old_cashiers.id !== this.new_cashiers.id;
            }else{
                return !!this.old_cashiers !== !!this.new_cashiers;
            }
        },
        toggle_save_button: function(){
            var $button = this.$('.button.next');
            if (this.editing_client) {
                $button.addClass('oe_hidden');
                return;
            } else if( this.new_cashiers ){
                if( !this.old_cashiers){
                    $button.text(_t('Set Cashier'));
                }else{
                    $button.text(_t('Change Cashier'));
                }
            }else{
                $button.text(_t('Deselect Cashier'));
            }
            $button.toggleClass('oe_hidden',!this.has_client_changed());
        },
        line_select: function(event,$line,id){
            var cashier = this.pos.db.get_cashier_by_id(id);
            this.$('.client-list .lowlight').removeClass('lowlight');
            if ( $line.hasClass('highlight') ){
                $line.removeClass('highlight');
                $line.addClass('lowlight');
                this.display_client_details('hide',cashier);
                this.new_cashiers = null;
                this.toggle_save_button();
            }else{
                this.$('.client-list .highlight').removeClass('highlight');
                $line.addClass('highlight');
                var y = event.pageY - $line.parent().offset().top
                this.display_client_details('show',cashier,y);
                this.new_cashiers = cashier;
                this.toggle_save_button();
            }
        },
        partner_icon_url: function(id){
            return true
            //return '/web/binary/image?model=res.partner&id='+id+'&field=image_small';
        },

        // ui handle for the 'edit selected customer' action
        edit_client_details: function(cashier) {
            this.display_client_details('edit',cashier);
        },

        // ui handle for the 'cancel customer edit changes' action
        undo_client_details: function(cashier) {
            if (!cashier.id) {
                this.display_client_details('hide');
            } else {
                this.display_client_details('show',cashier);
            }
        },

        // what happens when we save the changes on the client edit form -> we fetch the fields, sanitize them,
        // send them to the backend for update, and call saved_client_details() when the server tells us the
        // save was successfull.
        save_client_details: function(cashier) {
            var self = this;

            var fields = {}
            this.$('.client-details-contents .detail').each(function(idx,el){
                fields[el.name] = el.value;
            });

            if (!fields.name) {
                this.pos_widget.screen_selector.show_popup('error',{
                    message: _t('A Customer Name Is Required'),
                });
                return;
            }

            if (this.uploaded_picture) {
                fields.image = this.uploaded_picture;
            }

            fields.id           = cashier.id || false;
           // fields.country_id   = fields.country_id || false;
           // fields.ean13        = fields.ean13 ? this.pos.barcode_reader.sanitize_ean(fields.ean13) : false;

            new instance.web.Model('res.partner').call('create_from_ui',[fields]).then(function(partner_id){
                self.saved_client_details(partner_id);
            },function(err,event){
                event.preventDefault();
                self.pos_widget.screen_selector.show_popup('error',{
                    'message':_t('Error: Could not Save Changes'),
                    'comment':_t('Your Internet connection is probably down.'),
                });
            });
        },

        // what happens when we've just pushed modifications for a partner of id partner_id
        saved_client_details: function(partner_id){
            var self = this;
            this.reload_cashiers().then(function(){
                var cashier = self.pos.db.get_cashier_by_id(cashier_id);
                if (cashier) {
                    self.new_client = cashier;
                    self.toggle_save_button();
                    self.display_client_details('show',cashier);
                } else {
                    // should never happen, because create_from_ui must return the id of the partner it
                    // has created, and reload_partner() must have loaded the newly created partner.
                    self.display_client_details('hide');
                }
            });
        },

        // resizes an image, keeping the aspect ratio intact,
        // the resize is useful to avoid sending 12Mpixels jpegs
        // over a wireless connection.
        resize_image_to_dataurl: function(img, maxwidth, maxheight, callback){
            img.onload = function(){
                var png = new Image();
                var canvas = document.createElement('canvas');
                var ctx    = canvas.getContext('2d');
                var ratio  = 1;

                if (img.width > maxwidth) {
                    ratio = maxwidth / img.width;
                }
                if (img.height * ratio > maxheight) {
                    ratio = maxheight / img.height;
                }
                var width  = Math.floor(img.width * ratio);
                var height = Math.floor(img.height * ratio);

                canvas.width  = width;
                canvas.height = height;
                ctx.drawImage(img,0,0,width,height);

                var dataurl = canvas.toDataURL();
                callback(dataurl);
            }
        },

        // Loads and resizes a File that contains an image.
        // callback gets a dataurl in case of success.
        load_image_file: function(file, callback){
            var self = this;
            if (!file.type.match(/image.*/)) {
                this.pos_widget.screen_selector.show_popup('error',{
                    message:_t('Unsupported File Format'),
                    comment:_t('Only web-compatible Image formats such as .png or .jpeg are supported'),
                });
                return;
            }

            var reader = new FileReader();
            reader.onload = function(event){
                var dataurl = event.target.result;
                var img     = new Image();
                img.src = dataurl;
                self.resize_image_to_dataurl(img,800,600,callback);
            }
            reader.onerror = function(){
                self.pos_widget.screen_selector.show_popup('error',{
                    message:_t('Could Not Read Image'),
                    comment:_t('The provided file could not be read due to an unknown error'),
                });
            };
            reader.readAsDataURL(file);
        },

        // This fetches partner changes on the server, and in case of changes,
        // rerenders the affected views
        reload_cashiers: function(){
            var self = this;
            return this.pos.load_new_partners().then(function(){
                self.render_list(self.pos.db.get_cashiers_sorted(1000));

                // update the currently assigned client if it has been changed in db.
                var curr_client = self.pos.get_order().get_cashiers();
                if (curr_client) {
                    self.pos.get_order().set_cashiers(self.pos.db.get_cashier_by_id(curr_client.id));
                }
            });
        },

        // Shows,hides or edit the customer details box :
        // visibility: 'show', 'hide' or 'edit'
        // partner:    the partner object to show or edit
        // clickpos:   the height of the click on the list (in pixel), used
        //             to maintain consistent scroll.
        display_client_details: function(visibility,cashier,clickpos){
            var self = this;
            var contents = this.$('.client-details-contents');
            var parent   = this.$('.client-list').parent();
            var scroll   = parent.scrollTop();
            var height   = contents.height();

            contents.off('click','.button.edit');
            contents.off('click','.button.save');
            contents.off('click','.button.undo');
            contents.on('click','.button.edit',function(){ self.edit_client_details(cashier); });
            contents.on('click','.button.save',function(){ self.save_client_details(cashier); });
            contents.on('click','.button.undo',function(){ self.undo_client_details(cashier); });
            this.editing_client = false;
            this.uploaded_picture = null;

            if(visibility === 'show'){
                contents.empty();
                contents.append($(QWeb.render('CashierDetails',{widget:this,cashier:cashier})));

                var new_height   = contents.height();

                if(!this.details_visible){
                    if(clickpos < scroll + new_height + 20 ){
                        parent.scrollTop( clickpos - 20 );
                    }else{
                        parent.scrollTop(parent.scrollTop() + new_height);
                    }
                }else{
                    parent.scrollTop(parent.scrollTop() - height + new_height);
                }

                this.details_visible = true;
                this.toggle_save_button();
            } else if (visibility === 'edit') {
                this.editing_client = true;
                contents.empty();
                contents.append($(QWeb.render('CashierDetailsEdit',{widget:this,cashier:cashier})));
                this.toggle_save_button();

                contents.find('.image-uploader').on('change',function(){
                    self.load_image_file(event.target.files[0],function(res){
                        if (res) {
                            contents.find('.client-picture img, .client-picture .fa').remove();
                            contents.find('.client-picture').append("<img src='"+res+"'>");
                            contents.find('.detail.picture').remove();
                            self.uploaded_picture = res;
                        }
                    });
                });
            } else if (visibility === 'hide') {
                contents.empty();
                if( height > scroll ){
                    contents.css({height:height+'px'});
                    contents.animate({height:0},400,function(){
                        contents.css({height:''});
                    });
                }else{
                    parent.scrollTop( parent.scrollTop() - height);
                }
                this.details_visible = false;
                this.toggle_save_button();
            }
        },
        close: function(){
            this._super();
        },
    });

    // replace show method for setting product screen when click on cancel.
    module.ClientListScreenWidget.include({
        show: function(){
            var self = this;
            this._super();

            this.renderElement();
            this.details_visible = false;
            this.old_client = this.pos.get('selectedOrder').get('client');
            this.new_client = this.old_client;

            this.$('.back').click(function(){
                self.pos.pos_widget.screen_selector.set_current_screen('products');
                //self.pos_widget.screen_selector.back();
            });

            this.$('.next').click(function(){
                self.save_changes();
                self.pos_widget.screen_selector.back();
            });

            this.$('.new-customer').click(function(){
                self.display_client_details('edit',{
                    'country_id': self.pos.company.country_id,
                });
            });

            var partners = this.pos.db.get_partners_sorted(1000);
            this.render_list(partners);

            this.reload_partners();

            if( this.old_client ){
                this.display_client_details('show',this.old_client,0);
            }

            this.$('.client-list-contents').delegate('.client-line','click',function(event){
                self.line_select(event,$(this),parseInt($(this).data('id')));
            });

            var search_timeout = null;

            if(this.pos.config.iface_vkeyboard && this.pos_widget.onscreen_keyboard){
                this.pos_widget.onscreen_keyboard.connect(this.$('.searchbox input'));
            }

            this.$('.searchbox input').on('keyup',function(event){
                clearTimeout(search_timeout);

                var query = this.value;

                search_timeout = setTimeout(function(){
                    self.perform_search(query,event.which === 13);
                },70);
            });

            this.$('.searchbox .search-clear').click(function(){
                self.clear_search();
            });
        },
    });

};


openerp.extended_pos = function(instance) {
var module = instance.point_of_sale;
extend_pos(instance,module);
};

