import _ from 'underscore';

import View from 'girder/views/View';

import FolderCollection from 'girder/collections/FolderCollection';

import ItemSelectorWidget from './ItemSelectorWidget';
import FolderSelectorWidget from './FolderSelectorWidget';

import booleanWidget from '../templates/booleanWidget.pug';
import colorWidget from '../templates/colorWidget.pug';
import enumerationWidget from '../templates/enumerationWidget.pug';

import fileWidget from '../templates/fileWidget.pug';
import folderWidget from '../templates/folderWidget.pug';
import rangeWidget from '../templates/rangeWidget.pug';
import regionWidget from '../templates/regionWidget.pug';
import widget from '../templates/widget.pug';

import '../stylesheets/controlWidget.styl';
import 'bootstrap-colorpicker/dist/js/bootstrap-colorpicker';
import 'bootstrap-colorpicker/dist/css/bootstrap-colorpicker.css';
import 'bootstrap-slider/dist/bootstrap-slider';
import 'bootstrap-slider/dist/css/bootstrap-slider.css';

import events from '../events';

var ControlWidget = View.extend({
    events: {
        'change input,select': '_input',
        'changeColor': '_input',
        'click .s-select-file-button': '_selectFile',
        'click .s-select-folder-button': '_selectFolder',
        'click .s-select-region-button': '_selectRegion',
        'click .optionFolder': '_seletFromOption'
    },

    initialize: function (settings) {
        this.listenTo(this.model, 'change', this.change);
        this.listenTo(this.model, 'destroy', this.remove);
        this.listenTo(this.model, 'invalid', this.invalid);
        this.listenTo(events, 's:widgetSet:' + this.model.id, (value) => {
            this.model.set('value', value);
        });

        this.optionFolders = settings.optionFolders;
        this.taskFolder = settings.taskFolder;
    },

    render: function (_, options) {
        this.$('.form-group').removeClass('has-error');
        this.model.isValid();
        if (options && options.norender) {
            return this;
        }
        // console.log('---------------56--------------');
        // console.log(this.model.attributes);
        // let templateAttributes = Object.assign(this.model.attributes, {'optionFolders': this.optionFolders});
        this.model.set('optionFolders', this.optionFolders);
        // console.log(templateAttributes);
        // console.log(this.model.attributes);
        this.$el.html(this.template()(this.model.attributes)); // eslint-disable-line backbone/no-view-model-attributes
        this.$('.s-control-item[data-type="range"] input').slider();
        this.$('.s-control-item[data-type="color"] .input-group').colorpicker({});
        this.$('[data-toggle="tooltip"]').tooltip({container: 'body'});
        return this;
    },

    change: function () {
        events.trigger('s:widgetChanged:' + this.model.get('type'), this.model);
        events.trigger('s:widgetChanged', this.model);
        this.render.apply(this, arguments);
    },

    remove: function () {
        events.trigger('s:widgetRemoved:' + this.model.get('type'), this.model);
        events.trigger('s:widgetRemoved', this.model);
        this.$('.s-control-item[data-type="color"] .input-group').colorpicker('destroy');
        this.$('.s-control-item[data-type="range"] input').slider('destroy');
        this.$el.empty();
    },

    /**
     * Set classes on the input element to indicate to the user that the current value
     * is invalid.  This is automatically triggered by the model's "invalid" event.
     */
    invalid: function () {
        events.trigger('s:widgetInvalid:' + this.model.get('type'), this.model);
        events.trigger('s:widgetInvalid', this.model);
        this.$('.form-group').addClass('has-error');
    },

    /**
     * Type definitions mapping used internally.  Each widget type
     * specifies it's pug template and possibly more customizations
     * as needed.
     */
    _typedef: {
        range: {
            template: rangeWidget
        },
        color: {
            template: colorWidget
        },
        string: {
            template: widget
        },
        number: {
            template: widget
        },
        integer: {
            template: widget
        },
        boolean: {
            template: booleanWidget
        },
        'string-vector': {
            template: widget
        },
        'number-vector': {
            template: widget
        },
        'string-enumeration': {
            template: enumerationWidget
        },
        'number-enumeration': {
            template: enumerationWidget
        },
        file: {
            template: fileWidget
        },
        item: {
            template: fileWidget
        },
        image: {
            template: fileWidget
        },
        directory: {
            template: folderWidget
        },
        'new-file': {
            template: fileWidget
        },
        'new-item': {
            template: fileWidget
        },
        'new-directory': {
            template: folderWidget
        },
        region: {
            template: regionWidget
        }
    },

    /**
     * Get the appropriate template for the model type.
     */
    template: function () {
        var type = this.model.get('type');
        var def = this._typedef[type];
        if (def === undefined) {
            console.warn('Invalid widget type "' + type + '"'); // eslint-disable-line no-console
            def = {};
        }
        return def.template || _.template('');
    },

    /**
     * Get the current value from an input (or select) element.
     */
    _input: function (evt) {
        var $el, val;

        $el = $(evt.target);
        val = $el.val();

        if ($el.attr('type') === 'checkbox') {
            val = $el.get(0).checked;
        }

        // we don't want to rerender, because this event is generated by the input element
        this.model.set('value', val, {norender: true});
    },

    /**
     * Get the value from a file selection modal and set the text in the widget's
     * input element.
     */
    _selectFile: function () {
        var modal = new ItemSelectorWidget({
            el: $('#g-dialog-container'),
            parentView: this,
            model: this.model,
            taskFolder: this.taskFolder
        });
        modal.once('g:saved', () => {
            modal.$el.modal('hide');
        }).render();
    },

    /**
     * Get the value from a folder selection modal and set the text in the widget's
     * input element.
     */
    _selectFolder: function () {
        var modal = new FolderSelectorWidget({
            el: $('#g-dialog-container'),
            parentView: this,
            model: this.model,
            taskFolder: this.taskFolder
        });
        modal.once('g:saved', () => {
            modal.$el.modal('hide');
        }).render();
    },

    /**
     * Trigger a global event to initiate rectangle drawing mode to whoever
     * might be listening.
     */
    _selectRegion: function () {
        events.trigger('s:widgetDrawRegion', this.model);
    },
    _seletFromOption: function (e) {
        this.folderCollection = new FolderCollection();
        this.folderCollection.set(this.optionFolders);
        let cid = e.currentTarget.getAttribute('cid');

        this.model.set({
            // path: this._path(),
            value: this.folderCollection.get(cid)
        });
    }
});

export default ControlWidget;
