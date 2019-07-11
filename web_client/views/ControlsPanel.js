import Panel from './Panel';
import ControlWidget from './ControlWidget';

import controlsPanel from '../templates/controlsPanel.pug';
import '../stylesheets/controlsPanel.styl';

// import events from '../events';

var ControlsPanel = Panel.extend({
    initialize: function (settings) {
        this.title = settings.title || '';
        this.advanced = settings.advanced || false;
        this.listenTo(this.collection, 'add', this.addOne);
        this.listenTo(this.collection, 'reset', this.render);
        this.listenTo(this.collection, 'remove', this.removeWidget);

        this.optionFolders = settings.optionFolders;
        this.taskFolder = settings.taskFolder;
    },

    render: function () {
        this.$el.html(controlsPanel({
            title: this.title,
            collapsed: this.advanced,
            id: this.$el.attr('id')
        }));
        this.addAll();
        this.$('.s-panel-content').collapse({toggle: false});
    },

    addOne: function (model) {
        var view = new ControlWidget({
            model: model,
            parentView: this,
            optionFolders: this.optionFolders,
            taskFolder: this.taskFolder
        });
        this.$('form').append(view.render().el);
    },

    addAll: function () {
        this.$('form').children().remove();
        this.collection.each(this.addOne, this);
    },

    removeWidget: function (model) {
        model.destroy();
    }
});

export default ControlsPanel;
