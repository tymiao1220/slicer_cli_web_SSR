import _ from 'underscore';
import Backbone from 'backbone';
import { splitRoute, parseQueryString } from 'girder/misc';

import events from './events';

var router = new Backbone.Router();

router.setQuery = function setQuery(name, value, options) {
    var curRoute = Backbone.history.fragment,
        routeParts = splitRoute(curRoute),
        queryString = parseQueryString(routeParts.name);
    console.log(queryString);
    // Backbone.history.start()
    if (value === undefined || value === null) {
        delete queryString[name];
    } else {
        queryString[name] = value;
    }
    var unparsedQueryString = $.param(queryString);
    if (unparsedQueryString.length > 0) {
        unparsedQueryString = '?' + unparsedQueryString;
    }
    // console.log(queryString)
    this._lastQueryString = queryString;
    this.navigate(routeParts.base + unparsedQueryString, options);
};

router.getQuery = function getQuery(name) {
    return (this._lastQueryString || {})[name];
};

router.execute = function execute(callback, args) {
    console.log('execute');
    var query = parseQueryString(args.pop());
    // console.log(query);
    args.push(query);
    if (callback) {
        callback.apply(this, args);
    }

    _.each(this._lastQueryString || {}, function (value, key) {
        if (!_.has(query, key)) {
            events.trigger('query:' + key, null, query);
        }
    });
    _.each(query, function (value, key) {
        // console.log(query,key);
        events.trigger('query:' + key, value, query);
    });
    events.trigger('query', query);
    this._lastQueryString = query;
};

export default router;
