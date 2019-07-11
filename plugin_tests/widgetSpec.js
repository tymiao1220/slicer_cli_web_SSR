girderTest.importPlugin('jobs', 'worker', 'slicer_cli_web_SSR');

var slicer;
girderTest.promise.done(function () {
    slicer = girder.plugins.slicer_cli_web_SSR;
});

describe('widget model', function () {
    // test different widget types
    it('range', function () {
        var w = new slicer.models.WidgetModel({
            type: 'range',
            title: 'Range widget',
            min: -10,
            max: 10,
            step: 0.5
        });
        expect(w.isNumeric()).toBe(true);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        w.set('value', '0.5');
        expect(w.value()).toBe(0.5);
        expect(w.isValid()).toBe(true);

        w.set('value', 'a number');
        expect(w.isValid()).toBe(false);

        w.set('value', -11);
        expect(w.isValid()).toBe(false);

        w.set('value', 0.75);
        expect(w.isValid()).toBe(false);

        w.set('value', 0);
        expect(w.isValid()).toBe(true);
    });
    it('basic number', function () {
        var w = new slicer.models.WidgetModel({
            type: 'number',
            title: 'Number widget'
        });
        expect(w.isNumeric()).toBe(true);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        w.set('value', '0.5');
        expect(w.value()).toBe(0.5);
        expect(w.isValid()).toBe(true);

        w.set('value', 'a number');
        expect(w.isValid()).toBe(false);
    });
    it('integer number', function () {
        var w = new slicer.models.WidgetModel({
            type: 'number',
            title: 'Number widget',
            step: 1
        });
        w.set('value', '0.5');
        expect(w.value()).toBe(0.5);
        expect(w.isValid()).toBe(false);

        w.set('value', '-11');
        expect(w.isValid()).toBe(true);
    });
    it('float number', function () {
        var w = new slicer.models.WidgetModel({
            type: 'number',
            title: 'Number widget'
        });
        w.set('value', '1e-10');
        expect(w.value()).toBe(1e-10);
        expect(w.isValid()).toBe(true);
    });
    it('boolean', function () {
        var w = new slicer.models.WidgetModel({
            type: 'boolean',
            title: 'Boolean widget'
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(true);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        expect(w.value()).toBe(false);
        expect(w.isValid()).toBe(true);

        w.set('value', {});
        expect(w.value()).toBe(true);
        expect(w.isValid()).toBe(true);
    });
    it('string', function () {
        var w = new slicer.models.WidgetModel({
            type: 'string',
            title: 'String widget',
            value: 'Default value'
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        expect(w.value()).toBe('Default value');
        expect(w.isValid()).toBe(true);

        w.set('value', 1);
        expect(w.value()).toBe('1');
        expect(w.isValid()).toBe(true);
    });
    it('color', function () {
        var w = new slicer.models.WidgetModel({
            type: 'color',
            title: 'Color widget'
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(true);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        w.set('value', '#ffffff');
        expect(w.value()).toBe('#ffffff');
        expect(w.isValid()).toBe(true);

        w.set('value', 'red');
        expect(w.value()).toBe('#ff0000');
        expect(w.isValid()).toBe(true);

        w.set('value', 'rgb(0, 255, 0)');
        expect(w.value()).toBe('#00ff00');
        expect(w.isValid()).toBe(true);

        w.set('value', [255, 255, 0]);
        expect(w.value()).toBe('#ffff00');
        expect(w.isValid()).toBe(true);
    });
    it('string-vector', function () {
        var w = new slicer.models.WidgetModel({
            type: 'string-vector',
            title: 'String vector widget'
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(true);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        w.set('value', 'a,b,c');
        expect(w.value()).toEqual(['a', 'b', 'c']);
        expect(w.isValid()).toBe(true);

        w.set('value', ['a', 1, '2']);
        expect(w.value()).toEqual(['a', '1', '2']);
        expect(w.isValid()).toBe(true);
    });
    it('number-vector', function () {
        var w = new slicer.models.WidgetModel({
            type: 'number-vector',
            title: 'Number vector widget'
        });
        expect(w.isNumeric()).toBe(true);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(true);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        w.set('value', 'a,b,c');
        expect(w.isValid()).toBe(false);

        w.set('value', ['a', 1, '2']);
        expect(w.isValid()).toBe(false);

        w.set('value', '1,2,3');
        expect(w.value()).toEqual([1, 2, 3]);
        expect(w.isValid()).toBe(true);

        w.set('value', ['0', 1, '2']);
        expect(w.value()).toEqual([0, 1, 2]);
        expect(w.isValid()).toBe(true);
    });
    it('string-enumeration', function () {
        var w = new slicer.models.WidgetModel({
            type: 'string-enumeration',
            title: 'String enumeration widget',
            values: [
                'value 1',
                'value 2',
                'value 3'
            ]
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(true);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        w.set('value', 'value 1');
        expect(w.isValid()).toBe(true);

        w.set('value', 'value 4');
        expect(w.isValid()).toBe(false);

        w.set('value', 'value 3');
        expect(w.isValid()).toBe(true);
    });
    it('number-enumeration', function () {
        var w = new slicer.models.WidgetModel({
            type: 'number-enumeration',
            title: 'Number enumeration widget',
            values: [
                11,
                12,
                '13'
            ]
        });
        expect(w.isNumeric()).toBe(true);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(true);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        w.set('value', '11');
        expect(w.isValid()).toBe(true);

        w.set('value', 0);
        expect(w.isValid()).toBe(false);

        w.set('value', 13);
        expect(w.isValid()).toBe(true);
    });
    it('file', function () {
        var w = new slicer.models.WidgetModel({
            type: 'file',
            title: 'File widget'
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(true);
        expect(w.isItem()).toBe(false);
    });
    it('item', function () {
        var w = new slicer.models.WidgetModel({
            type: 'item',
            title: 'Item widget'
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(true);
    });
    it('invalid', function () {
        var w = new slicer.models.WidgetModel({
            type: 'invalid type',
            title: 'Invalid widget'
        });
        expect(w.isNumeric()).toBe(false);
        expect(w.isBoolean()).toBe(false);
        expect(w.isVector()).toBe(false);
        expect(w.isColor()).toBe(false);
        expect(w.isEnumeration()).toBe(false);
        expect(w.isFile()).toBe(false);
        expect(w.isItem()).toBe(false);

        expect(w.isValid()).toBe(false);
    });
});

describe('widget collection', function () {
    it('values', function () {
        var c = new slicer.collections.WidgetCollection([
            {type: 'range', id: 'range', value: 0},
            {type: 'number', id: 'number', value: '1'},
            {type: 'boolean', id: 'boolean', value: 'yes'},
            {type: 'string', id: 'string', value: 0},
            {type: 'color', id: 'color', value: 'red'},
            {type: 'string-vector', id: 'string-vector', value: 'a,b,c'},
            {type: 'number-vector', id: 'number-vector', value: '1,2,3'},
            {type: 'string-enumeration', id: 'string-enumeration', values: ['a'], value: 'a'},
            {type: 'number-enumeration', id: 'number-enumeration', values: [1], value: '1'},
            {type: 'file', id: 'file', value: new Backbone.Model({id: 'a'})},
            {type: 'new-file', id: 'new-file', value: new Backbone.Model({name: 'a', folderId: 'b'})},
            {type: 'item', id: 'item', value: new Backbone.Model({id: 'c'})},
            {type: 'image', id: 'image', value: new Backbone.Model({id: 'd'})}
        ]);

        expect(c.values()).toEqual({
            range: '0',
            number: '1',
            boolean: 'true',
            string: '"0"',
            color: '"#ff0000"',
            'string-vector': '["a","b","c"]',
            'number-vector': '[1,2,3]',
            'string-enumeration': '"a"',
            'number-enumeration': '1',
            'file_girderFileId': 'a',
            'new-file_girderFolderId': 'b',
            'new-file_name': 'a',
            'item_girderItemId': 'c',
            'image_girderFileId': 'd'
        });
    });
});

describe('control widget view', function () {
    var $el, hInit, hRender, hProto, parentView = {
        registerChildView: function () {}
    };

    function checkWidgetCommon(widget) {
        var model = widget.model;
        expect(widget.$('label[for="' + model.id + '"]').text())
            .toBe(model.get('title'));
        if (widget.model.isEnumeration()) {
            expect(widget.$('select#' + model.id).length).toBe(1);
        } else {
            expect(widget.$('input#' + model.id).length).toBe(1);
        }
    }

    beforeEach(function () {
        hProto = girder.views.widgets.HierarchyWidget.prototype;
        hInit = hProto.initialize;
        hRender = hProto.render;

        $el = $('<div/>').appendTo('body');
    });

    afterEach(function () {
        hProto.initialize = hInit;
        hProto.render = hRender;
        $el.remove();
    });

    it('range', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'range',
                title: 'Title',
                id: 'range-widget',
                value: 2,
                min: 0,
                max: 10,
                step: 2
            })
        });

        w.render();

        checkWidgetCommon(w);
        expect(w.$('input').val()).toBe('2');
        w.$('input').val('4').trigger('change');
        expect(w.model.value()).toBe(4);
    });

    it('number', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'number',
                title: 'Title',
                id: 'number-widget',
                value: 2,
                min: 0,
                max: 10,
                step: 2
            })
        });

        w.render();

        checkWidgetCommon(w);
        expect(w.$('input').val()).toBe('2');
        w.$('input').val('4').trigger('change');
        expect(w.model.value()).toBe(4);

        w.$('input').val('4').trigger('change');
        expect(w.$('.form-group').hasClass('has-error')).toBe(false);
    });

    it('boolean', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'boolean',
                title: 'Title',
                id: 'boolean-widget'
            })
        });

        w.render();

        checkWidgetCommon(w);
        expect(w.$('input').prop('checked')).toBe(false);

        w.$('input').click();
        expect(w.model.value()).toBe(true);
    });

    it('string', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'string',
                title: 'Title',
                id: 'string-widget',
                value: 'default'
            })
        });

        w.render();

        checkWidgetCommon(w);
        expect(w.$('input').val()).toBe('default');

        w.$('input').val('new value').trigger('change');
        expect(w.model.value()).toBe('new value');
    });

    it('color', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'color',
                title: 'Title',
                id: 'color-widget',
                value: 'red'
            })
        });

        w.render();

        checkWidgetCommon(w);
        expect(w.model.value()).toBe('#ff0000');

        w.$('.input-group-addon').click();
        expect($('.colorpicker-visible').length).toBe(1);

        w.$('input').val('#ffffff').trigger('change');
        expect(w.model.value()).toBe('#ffffff');
    });

    it('string-vector', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'string-vector',
                title: 'Title',
                id: 'string-vector-widget',
                value: 'one,two,three'
            })
        });

        w.render();
        checkWidgetCommon(w);
        expect(w.$('input').val()).toBe('one,two,three');

        w.$('input').val('1,2,3').trigger('change');
        expect(w.model.value()).toEqual(['1', '2', '3']);
    });

    it('number-vector', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'number-vector',
                title: 'Title',
                id: 'number-vector-widget',
                value: '1,2,3'
            })
        });

        w.render();
        checkWidgetCommon(w);
        expect(w.$('input').val()).toBe('1,2,3');

        w.$('input').val('10,20,30').trigger('change');
        expect(w.model.value()).toEqual([10, 20, 30]);
    });

    it('string-enumeration', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'string-enumeration',
                title: 'Title',
                id: 'string-enumeration-widget',
                value: 'value 2',
                values: [
                    'value 1',
                    'value 2',
                    'value 3'
                ]
            })
        });

        w.render();
        checkWidgetCommon(w);
        expect(w.$('select').val()).toBe('value 2');

        w.$('select').val('value 3').trigger('change');
        expect(w.model.value()).toBe('value 3');
    });

    it('number-enumeration', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'number-enumeration',
                title: 'Title',
                id: 'number-enumeration-widget',
                value: 200,
                values: [
                    100,
                    200,
                    300
                ]
            })
        });

        w.render();
        checkWidgetCommon(w);
        expect(w.$('select').val()).toBe('200');

        w.$('select').val('300').trigger('change');
        expect(w.model.value()).toBe(300);
    });

    it('item', function () {
        var arg, item = new girder.models.ItemModel({id: 'model id', name: 'b'});

        hProto.initialize = function (_arg) {
            arg = _arg;
            this.breadcrumbs = [];
        };
        hProto.render = function () {};

        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'item',
                title: 'Title',
                id: 'item-widget'
            })
        });

        w.render();
        checkWidgetCommon(w);

        w.$('.s-select-file-button').click();
        expect(arg.parentModel).toBe(girder.auth.getCurrentUser());
        arg.onItemClick(item);
        expect(w.model.value().name()).toBe('b');

        expect(w.model.get('path')).toEqual([]);
    });

    it('file', function () {
        var arg, file, item, w;
        runs(function () {
            item = new girder.models.ItemModel({_id: 'item id', name: 'd'});
            file = new girder.models.FileModel({_id: 'file id', name: 'e'});

            hProto.initialize = function (_arg) {
                arg = _arg;
                this.breadcrumbs = [];
            };
            hProto.render = function () {};
            w = new slicer.views.ControlWidget({
                parentView: parentView,
                el: $el.get(0),
                model: new slicer.models.WidgetModel({
                    type: 'file',
                    title: 'Title',
                    id: 'file-widget'
                })
            });

            w.render();
            checkWidgetCommon(w);

            girder.rest.mockRestRequest(function (opts) {
                if (opts.url.substr(0, 5) === 'file/') {
                    return $.Deferred().resolve(file.toJSON());
                }
                return $.Deferred().resolve([file.toJSON()]);
            });
            w.$('.s-select-file-button').click();
            expect(arg.parentModel).toBe(girder.auth.getCurrentUser());
            arg.onItemClick(item);
        });
        waitsFor(function () {
            return w.model.value().name() === 'e';
        });
        runs(function () {
            expect(w.model.value().name()).toBe('e');
            expect(w.model.get('path')).toEqual([]);
            girder.rest.unmockRestRequest();
        });
    });

    it('image', function (done) {
        var arg, item, file, w;
        runs(function () {
            file = new girder.models.FileModel({_id: 'file id', name: 'g'});
            item = new girder.models.ItemModel({
                _id: 'item id', name: 'f', largeImage: {fileId: file.id}});

            hProto.initialize = function (_arg) {
                arg = _arg;
                this.breadcrumbs = [];
            };
            hProto.render = function () {};

            w = new slicer.views.ControlWidget({
                parentView: parentView,
                el: $el.get(0),
                model: new slicer.models.WidgetModel({
                    type: 'image',
                    title: 'Title',
                    id: 'image-widget'
                })
            });

            w.render();
            checkWidgetCommon(w);

            girder.rest.mockRestRequest(function (opts) {
                return $.Deferred().resolve(file.toJSON());
            });
            w.$('.s-select-file-button').click();
            expect(arg.parentModel).toBe(girder.auth.getCurrentUser());
            arg.onItemClick(item);
        });
        waitsFor(function () {
            return w.model.value().name() === 'g';
        });
        runs(function () {
            expect(w.model.value().name()).toBe('g');
            expect(w.model.get('path')).toEqual([]);
            girder.rest.unmockRestRequest();
        });
    });

    it('new-file', function () {
        var arg,
            hView,
            collection = new girder.models.CollectionModel({id: 'model id', name: 'b'}),
            folder = new girder.models.FolderModel({id: 'folder id', name: 'c'}),
            $modal = $('<div id="g-dialog-container"/>').appendTo('body');

        hProto.initialize = function (_arg) {
            arg = _arg;
            hView = this;
            this.breadcrumbs = [];
        };
        hProto.render = function () {};
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'new-file',
                title: 'Title',
                id: 'file-widget'
            })
        });

        w.render();
        checkWidgetCommon(w);

        slicer.rootPath = {};
        w.$('.s-select-file-button').click();
        expect(arg.parentModel).toBe(girder.auth.getCurrentUser());

        // selecting without a file name entered should error
        $modal.find('.s-select-button').click();
        expect($modal.find('.form-group').hasClass('has-error')).toBe(true);
        expect($modal.find('.s-modal-error').hasClass('hidden')).toBe(false);

        // selecting with a file name in a collection should error
        $modal.find('#s-new-file-name').val('my file');
        hView.parentModel = collection;
        $modal.find('.s-select-button').click();
        expect($modal.find('.form-group').hasClass('has-error')).toBe(false);
        expect($modal.find('.s-modal-error').hasClass('hidden')).toBe(false);

        // selecting a file in a folder should succeed
        hView.parentModel = folder;
        $modal.find('.s-select-button').click();
        expect($modal.find('.form-group').hasClass('has-error')).toBe(false);
        expect($modal.find('.s-modal-error').hasClass('hidden')).toBe(true);
        expect(w.model.get('path')).toEqual([]);
        expect(w.model.get('value').get('name')).toBe('my file');

        // reset the environment
        $modal.modal('hide');
        $modal.remove();
    });
    it('invalid', function () {
        var w = new slicer.views.ControlWidget({
            parentView: parentView,
            el: $el.get(0),
            model: new slicer.models.WidgetModel({
                type: 'invalid',
                title: 'Title',
                id: 'invalid-widget'
            })
        });
        var _warn = console.warn;
        var message;
        console.warn = function (m) { message = m; };

        w.render();
        expect(message).toBe('Invalid widget type "invalid"');
        console.warn = _warn;
    });
});
