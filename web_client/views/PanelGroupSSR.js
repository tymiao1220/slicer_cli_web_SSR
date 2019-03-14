import _ from 'underscore';

import View from 'girder/views/View';
import girderEvents from 'girder/events';
import { restRequest } from 'girder/rest';
import { confirm } from 'girder/dialog';

import { parse } from '../parser';
import WidgetCollection from '../collections/WidgetCollection';
import events from '../events';
import JobsPanel from './JobsPanel';
import ControlsPanel from './ControlsPanel';

import panelGroup from '../templates/panelGroup.pug';

import JobCollection from 'girder_plugins/jobs/collections/JobCollection';
import FolderModel from 'girder/models/FolderModel';
import router from '../router';

import '../stylesheets/panelGroup.styl';
var PanelGroup = View.extend({
    events: {
        'click .s-info-panel-reload': 'reload',
        'click .s-info-panel-submit': 'submit',
        'click .s-remove-panel': 'removePanel'
    },
    initialize: function (settings) {
        this.panels = [];
        this._panelViews = {};

        this.listenTo(events, 'query:analysisTask', this.setAnalysis);
        this.listenTo(events, 'query:filesystemFolder', this.getOptionFolders);
        this.listenTo(events, 'query:setupOutputFolder', this.getTaskFolder);
    },
    render: function () {
        this.$el.html(panelGroup({
            info: this._gui,
            panels: this.panels
        }));
        // console.log(this.panels)
        this.$el.addClass('hidden');
        _.each(this._panelViews, function (view) {
            view.remove();
        });
        this._panelViews = {};
        // this._jobsPanelView.setElement(this.$('.s-jobs-panel')).render();
        _.each(this.panels, _.bind(function (panel) {
            this.$el.removeClass('hidden');
            this._panelViews[panel.id] = new ControlsPanel({
                parentView: this,
                collection: new WidgetCollection(panel.parameters),
                title: panel.label,
                advanced: panel.advanced,
                el: this.$el.find('#' + panel.id),
                optionFolders: this.optionFolders,
                taskFolder: this.taskFolder
            });

            this._panelViews[panel.id].render();
        }, this));

        return this;
    },

    /**
     * Submit the current values to the server.
     */
    submit: function () {
        var params, invalid = false;
        invalid = this.invalidModels();
        // console.log(invalid)
        if (invalid.length) {
            girderEvents.trigger('g:alert', {
                icon: 'attention',
                text: 'Please enter a valid value for: ' + invalid.map((m) => m.get('title')).join(', '),
                type: 'danger'
            });
            return;
        }

        params = this.parameters();
        console.log(params)
        _.each(params, function (value, key) {
            if (_.isArray(value)) {
                params[key] = JSON.stringify(value);
            }
        });
        // post the job to the server
        restRequest({
            url: this._submit,
            type: 'POST',
            data: params
        }).then(function (data) {
            events.trigger('h:submit', data);
            this.collection = new JobCollection();
            this.collection.fetch({sort: 'created',limit: 1,sortdir: -1}).then(()=>{
                this.newJob=this.collection.models[0].id;
                router.setQuery('JobProgress',this.newJob, {trigger: true})
            })
            return null;
        });
    },

    /**
     * Get the current values of all of the parameters contained in the gui.
     * Returns an object that maps each parameter id to it's value.
     */
    parameters: function () {
        //console.log(this._panelViews);
        //console.log(_.chain(this._panelViews)
        //    .pluck('collection'));
        window.test=this._panelViews;

        return _.chain(this._panelViews)
            .pluck('collection')
            .invoke('values')
            .reduce(function (a, b) {
                return _.extend(a, b);
            }, {})
            .value();
            /*inputMultipleImage_girderItemId:
                "5b2aaa8f372ec3b37d5c36ee"
                outputThresholding_girderFolderId
                :
                "5b2aab8b372ec3b37d5c3723"
                outputThresholding_name
                :
                "1.nrrd"
                tableFile_girderFolderId
                :
                "5b2aab8b372ec3b37d5c3723"
                tableFile_name
                :
                "1.csv"
                */
    },

    /**
     * Return an array of all widget models optionally filtered by the given panel id
     * and model filtering function.
     */
    models: function (panelId, modelFilter) {
        // console.log(panelId);
        modelFilter = modelFilter || _.constant(true);
        return _.chain(this._panelViews)
            .filter(function (v, i) {
                return panelId === undefined || panelId === i;
            })
            .pluck('collection')
            .pluck('models')
            .flatten()
            .filter(modelFilter)
            .value();
    },

    /**
     * Return an array of all invalid models.  Optionally filter by the given panel id.
     */
    invalidModels: function (panelId) {
        return this.models(panelId, function (m) { return !m.isValid(); });
    },

    /**
     * Return true if all parameters are set and valid.  Also triggers 'invalid'
     * events on each of the invalid models as a byproduct.
     */
    validate: function () {
        return !this.invalidModels().length;
    },

    /**
     * Remove a panel after confirmation from the user.
     */
    removePanel: function (e) {
        confirm({
            text: 'Are you sure you want to remove this panel?',
            confirmCallback: _.bind(function () {
                var el = $(e.currentTarget).data('target');
                var id = $(el).attr('id');
                this.panels = _.reject(this.panels, _.matcher({id: id}));
                this.render();
            }, this)
        });
    },

    /**
     * Remove all panels.
     */
    reset: function () {
        this.panels = [];
        this._gui = null;
        this._submit = null;
        this.render();
    },

    /**
     * Restore all panels to the default state.
     */
    reload: function () {
        if (!this._gui) {
            return this;
        }

        // Create a panel for each "group" in the schema, and copy
        // the advanced property from the parent panel.
        this.panels = _.chain(this._gui.panels).map(function (panel) {
            return _.map(panel.groups, function (group) {
                group.advanced = !!panel.advanced;
                group.id = _.uniqueId('panel-');
                return group;
            });
        }).flatten(true).value();

        this.render();
        return this;
    },

    /**
     * Set the panel group according to the given schema path.
     * This should be a url fragment such as
     *
     *   path = `HistomicsTK/dsarchive_histomicstk_v0.1.3`
     *
     * This code will fetch the actual schema from `path + '/xmlschema'`
     * and cause submissions to post to `path + '/run'`.
     */
    setAnalysis: function (path) {
        if (!path) {
            this.reset();
            return $.when();
        }
        return restRequest({
            url: path + '/xmlspec',
            dataType: 'xml'
        }).then(_.bind(function (xml) {
            this._submit = path + '/run';
            this._schema(xml);
            events.trigger('s:analysisTask', path, xml);
        }, this));
    },

    /**
     * Generate panels from a slicer XML schema.
     */
    _schema: function (xml) {
        var fail = false;
        // clear the view on null
        if (xml === null) {
            return this.reset();
        }

        try {
            this._json(parse(xml));
        } catch (e) {
            fail = true;
        }

        if (fail) {
            girderEvents.trigger('g:alert', {
                icon: 'attention',
                text: 'Invalid XML schema',
                type: 'danger'
            });
            this.reset();
            return this;
        }

        return this;
    },

    /**
     * Generate panels from a json schema.
     */
    _json: function (spec) {
        if (_.isString(spec)) {
            spec = JSON.parse(spec);
        }
        this._gui = spec;
        this.reload();
        return this;
    },
    /**
     * Get option folders id
     * 
     */
    _getOptionFoldersPromise(e){
        return new Promise(_.bind(function(resolve,reject){
            let getOriginalFolder = () => {
                return restRequest({
                    url: 'folder/' + e,
                }).then((res) => {
                    let folders = [];
                    let folder = new FolderModel(res);
                    folders.push(folder)
                    return folders
                })
            }
            let getSegmentFolders = () =>{
                return restRequest({
                    url: 'SSR/segmentationCheckFolder/' + e,
                }).then(_.bind((foldersObj) => {
                    let folders = [];
                    for(let a=0; a < foldersObj.length; a++){
                        let folder = new FolderModel(foldersObj[a]);
                        folders.push(folder)
                        // console.log(folder)
                    }
                    return folders
                }))
            }

            $.when(getOriginalFolder(),getSegmentFolders()).then((folder_o, folder_s)=>{
                let folders = [];
                // console.log(folder_s)
                folders =  folder_o.concat(folder_s)
                resolve(folders)
            })
        },this))
    },
    getOptionFolders(e){
        this._getOptionFoldersPromise(e).then((folders)=>{
            this.optionFolders = folders
            // console.log(folders)
        });
    },
    getTaskFolder(TaskFolderId){
        restRequest({
            url: 'folder/' + TaskFolderId,
        }).then((e) => {
            let TaskFolder = new FolderModel(e)
            this.taskFolder = TaskFolder;
            console.log('234');
            console.log(TaskFolder);
        });
    }
});

export default PanelGroup;
