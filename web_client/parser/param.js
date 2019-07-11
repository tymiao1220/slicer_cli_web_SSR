import _ from 'underscore';

import widget from './widget';
import convert from './convert';
import defaultValue from './defaultValue';
import constraints from './constraints';

/**
 * Parse a parameter spec.
 * @param {XML} param The parameter spec
 * @returns {object}
 */
function param(paramTag) {
    var $param = $(paramTag);
    var type = widget(paramTag);
    var values = {};

    var channel = $param.find('channel');
    var flag = $param.find('flag');
    var ext;
    if (channel.length) {
        channel = channel.text();
    } else {
        channel = 'input';
    }

    if (flag.text() === 'item') {
        flag = flag.text();
    } else {
        flag = undefined;
    }
    if (type === 'directory' && channel === 'input') {
        if (flag === 'item') {
            type = 'item';
        } else {
            type = 'directory';
        }
    }
    if ((type === 'file' || type === 'image') && channel === 'output') {
        type = 'new-file';
        ext = $param.attr('fileExtensions');
    }
    if (type === 'directory' && channel === 'output') {
        if (flag === 'item') {
            type = 'new-item';
        } else {
            type = 'new-directory';
        }
    }
    if (!type) {
        console.warn('Unhandled parameter type "' + paramTag.tagName + '"'); // eslint-disable-line no-console
    }

    if (type === 'string-enumeration' || type === 'number-enumeration') {
        values = {
            values: _.map($param.find('element'), (el) => {
                return convert(type, $(el).text());
            })
        };
    }

    return _.extend(
        {
            type: type,
            slicerType: paramTag.tagName,
            id: $param.find('name').text() || $param.find('longflag').text(),
            title: $param.find('label').text(),
            description: $param.find('description').text(),
            channel: channel,
            flag: flag,
            ext: ext
        },
        values,
        defaultValue(type, $param.find('default')),
        constraints(type, $param.find('constraints').get(0))
    );
}

export default param;
