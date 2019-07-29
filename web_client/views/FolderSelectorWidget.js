import _ from 'underscore';

import { getCurrentUser } from 'girder/auth';
// import FileListWidget from 'girder/views/widgets/FileListWidget';
import View from 'girder/views/View';
import ItemModel from 'girder/models/ItemModel';
// import FileModel from 'girder/models/FileModel';
// import FolderModel from 'girder/models/FolderModel';

// import { restRequest } from 'girder/rest';
import HierarchyWidget from './widgets/slicerHierarchyWidget';
import folderSelectorWidget from '../templates/folderSelectorWidget.pug';
// import events from '../events';

// TODO: channel is input, save selected folder
var FolderSelectorWidget = View.extend({
    events: {
        'submit .s-new-folder-select-form': '_selectButton'
    },

    initialize: function (settings) {
        if (!this.model) {
            this.model = new ItemModel();
        }
        if (this.model.get('channel') === 'input') {
            this.checkboxes = true;
        } else {
            this.checkboxes = false;
        }
        this.taskFolder = settings.taskFolder;
        this.rootPath = settings.rootPath || getCurrentUser();
    },

    render: function () {
        if (this.model.get('channel') === 'output') {
            this._hierarchyView = new HierarchyWidget({
                parentView: this,
                parentModel: this.taskFolder || this.rootPath,
                routing: false,
                showActions: false,
                showMetadata: false,
                downloadLinks: false,
                viewLinks: false,
                checkboxes: this.checkboxes
                // onItemClick: _.bind(this._selectItem, this)
            });
        } else {
            this._hierarchyView = new HierarchyWidget({
                parentView: this,
                parentModel: this.rootPath,
                routing: false,
                showActions: false,
                showMetadata: false,
                downloadLinks: false,
                viewLinks: false,
                checkboxes: this.checkboxes
                // onItemClick: _.bind(this._selectItem, this)
            });
        }
        this._hierarchyView.on('selectedFolderFromList', _.bind(function (selectedFolder) {
            this.selectedOutputFolder = selectedFolder;
        }, this)).on('selectedFolderFromCheckbox', _.bind(function (selectedFolder) {
            this.selectedInputFolder = selectedFolder;
        }, this));

        this.$el.html(
            folderSelectorWidget(this.model.attributes) // eslint-disable-line backbone/no-view-model-attributes
        ).girderModal(this);

        this._hierarchyView.setElement(this.$('.s-hierarchy-widget')).render();
        return this;
    },

    /**
     * Get the currently displayed path in the hierarchy view.
     */
    _path: function () {
        var path = this._hierarchyView.breadcrumbs.map(function (d) {
            return d.get('name');
        });

        if (this.model.get('type') === 'directory') {
            path = _.initial(path);
        }
        return path;
    },

    // _selectItem: function (item) {
    //     var image, file;
    //     switch (this.model.get('type')) {
    //         case 'item':

    //             this.model.set({
    //                 path: this._path(),
    //                 value: item
    //             });

    //             this.trigger('g:saved');
    //             this.$el.modal('hide');
    //             break;
    //         case 'file':
    //             restRequest({url: '/item/' + item.id + '/files', data: {limit: 1}}).done((resp) => {
    //                 if (!resp.length) {
    //                     this.$('.s-modal-error').removeClass('hidden')
    //                         .text('Please select a item with at least one file.');
    //                     return;
    //                 }
    //                 file = new FileModel({_id: resp[0]._id});
    //                 file.once('g:fetched', _.bind(function () {
    //                     this.model.set({
    //                         path: this._path(),
    //                         value: file
    //                     });
    //                     this.trigger('g:saved');
    //                 }, this)).fetch();
    //                 this.$el.modal('hide');
    //             }).fail(() => {
    //                 this.$('.s-modal-error').removeClass('hidden')
    //                     .text('There was an error listing files for the selected item.');
    //             });
    //             break;
    //         case 'image':
    //             image = item.get('largeImage');

    //             if (!image) {
    //                 this.$('.s-modal-error').removeClass('hidden')
    //                     .text('Please select a "large_image" item.');
    //                 return;
    //             }

    //             // Prefer the large_image fileId
    //             file = new FileModel({_id: image.fileId || image.originalId});
    //             file.once('g:fetched', _.bind(function () {
    //                 this.model.set({
    //                     path: this._path(),
    //                     value: file
    //                 });
    //                 this.trigger('g:saved');
    //             }, this)).fetch();
    //             this.$el.modal('hide');
    //             break;

    //         case 'directory':
    //             this.model.set({
    //                 path: this._path(),
    //                 value: item
    //             });

    //             this.trigger('g:saved');
    //             this.$el.modal('hide');
    //             break;

    //         case 'new-file-item':
    //             this.model.set({
    //                 path: this._path(),
    //                 value: item
    //             });

    //             this.trigger('g:saved');
    //             this.$el.modal('hide');
    //             break;
    //     }
    // },

    _selectButton: function (e) {
        e.preventDefault();

        var inputEl = this.$('#s-new-folder-name');
        var inputElGroup =  inputEl.parent();
        var fileName = inputEl.val();
        var type = this.model.get('type');
        var parent = this._hierarchyView.parentModel;

        var errorEl = this.$('.s-modal-error').addClass('hidden');

        inputElGroup.removeClass('has-error');

        switch (type) {
            case 'new-file':

                // a file name must be provided
                if (!fileName) {
                    inputElGroup.addClass('has-error');
                    errorEl.removeClass('hidden')
                        .text('You must provide a name for the new file.');
                    return;
                }

                // the parent must be a folder
                if (parent.resourceName !== 'folder') {
                    errorEl.removeClass('hidden')
                        .text('Files cannot be added under collections.');
                    return;
                }

                this.model.set({
                    path: this._path(),
                    parent: parent,
                    value: new ItemModel({
                        name: fileName,
                        folderId: parent.id
                    })
                });
                break;

            case 'new-item':

                // the parent must be a folder
                if (parent.resourceName !== 'folder') {
                    errorEl.removeClass('hidden')
                        .text('Files cannot be added under collections.');
                    return;
                }

                this.model.set({
                    path: this._path(),
                    value: parent
                });
                break;

            case 'new-directory':
                // a folder name must be provided
                if (!fileName) {
                    inputElGroup.addClass('has-error');
                    errorEl.removeClass('hidden')
                        .text('You must provide a name for the new folder.');
                    return;
                }

                // the parent must be a folder
                if (parent.resourceName !== 'folder') {
                    errorEl.removeClass('hidden')
                        .text('Files cannot be added under collections.');
                    return;
                }

                this.model.set({
                    path: this._path(),
                    parent: parent,
                    value: fileName
                });
                break;

            case 'directory':
                this.model.set({
                    path: this._path(),
                    value: this.selectedInputFolder
                });

                break;
        }
        this.trigger('g:saved');
        this.$el.modal('hide');
    }
});

export default FolderSelectorWidget;
