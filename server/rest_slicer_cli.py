import os
import sys
import json
import six
import subprocess
import tempfile

from ctk_cli import CLIModule
from girder.api.rest import Resource, loadmodel, boundHandler, \
    setResponseHeader, setRawResponse
from girder.api import access
from girder.api.describe import Description, describeRoute
from girder.constants import AccessType
from girder.plugins.worker import utils as wutils
from girder.utility.model_importer import ModelImporter
from girder.plugins.worker import constants
from girder import logger
from girder.models.group import Group

_SLICER_TO_GIRDER_WORKER_TYPE_MAP = {
    'boolean': 'boolean',
    'integer': 'integer',
    'float': 'number',
    'double': 'number',
    'string': 'string',
    'integer-vector': 'integer_list',
    'float-vector': 'number_list',
    'double-vector': 'number_list',
    'string-vector': 'string_list',
    'integer-enumeration': 'integer',
    'float-enumeration': 'number',
    'double-enumeration': 'number',
    'string-enumeration': 'string',
    'region': 'number_list',
    'file': 'string',
    'directory': 'string',
    'image': 'string'

}

_SLICER_TYPE_TO_GIRDER_MODEL_MAP = {
    'image': 'file',
    'file': 'file',
    'item': 'item',
    'string': 'url',
    # 'directory': 'item'
    'directory': 'folder'
}
_SLICER_TYPE_TO_GIRDER_INPUT_SUFFIX_MAP = {
    'image': '_girderFileId',
    'file': '_girderFileId',
    'item': '_girderItemId',
    'string': '_url',
    # 'directory': '_girderItemId'
    'directory': '_girderFolderId'
}

_worker_docker_data_dir = constants.DOCKER_DATA_VOLUME

_girderOutputFolderSuffix = '_girderFolderId'
_outputType = 'folder'
_girderOutputNameSuffix = '_name'

_return_parameter_file_name = 'returnparameterfile'
_return_parameter_file_desc = """
    Filename in which to write simple return parameters
    (integer, float, integer-vector, etc.) as opposed to bulk
    return parameters (image, file, directory, geometry,
    transform, measurement, table).
"""


def _getCLIParameters(clim):

    # get parameters
    index_params, opt_params, simple_out_params = clim.classifyParameters()

    # perform sanity checks
    for param in index_params + opt_params:
        if param.typ not in _SLICER_TO_GIRDER_WORKER_TYPE_MAP.keys():
            raise Exception(
                'Parameter type %s is currently not supported' % param.typ
            )

    # sort indexed parameters in increasing order of index

    index_params.sort(key=lambda p: p.index)

    # sort opt parameters in increasing order of name for easy lookup

    def get_flag(p):
        if p.flag is not None:
            return p.flag.strip('-')
        elif p.longflag is not None:
            return p.longflag.strip('-')
        else:
            return None
    # index_params.sort(key=lambda p: get_flag(p))
    # opt_params.sort(key=lambda p: get_flag(p))

    return index_params, opt_params, simple_out_params


def _createIndexedParamTaskSpec(param):
    """Creates task spec for indexed parameters

    Parameters
    ----------
    param : ctk_cli.CLIParameter
        parameter for which the task spec should be created

    """
    # print 'in _createIndexedParamTaskSpec param.label is '
    # print param.label  #Input Image/Output Thresholding File/Output Table File
    # print 'in _createIndexedParamTaskSpec param.typ is '
    # print param.typ   #directory/file/file

    curTaskSpec = dict()
    curTaskSpec['id'] = param.identifier()
    if _SLICER_TYPE_TO_GIRDER_MODEL_MAP[param.typ] != 'url':
        curTaskSpec['name'] = param.label
        curTaskSpec['type'] = _SLICER_TO_GIRDER_WORKER_TYPE_MAP[param.typ]
        curTaskSpec['format'] = _SLICER_TO_GIRDER_WORKER_TYPE_MAP[param.typ]

    if param.isExternalType():
        curTaskSpec['target'] = 'filepath'  # check

    return curTaskSpec


def _addIndexedInputParamsToHandler(index_input_params, handlerDesc):

    for param in index_input_params:
        # print param.isExternalType()
        # add to route description
        if param.isExternalType():
            if param.flag == '-item':
                suffix = '_girderItemId'
                handlerDesc.param(param.identifier() + suffix,
                                  'Girder ID of input %s - %s: %s'
                                  % (param.typ, param.identifier(), param.description),
                                  dataType='string', required=True)
                # print param.identifier() + suffix
                # print 'Girder ID of input %s - %s: %s' %
                # (param.typ, param.identifier(), param.description)
            else:
                suffix = _SLICER_TYPE_TO_GIRDER_INPUT_SUFFIX_MAP[param.typ]
                handlerDesc.param(param.identifier() + suffix,
                                  'Girder ID of input %s - %s: %s'
                                  % (param.typ, param.identifier(), param.description),
                                  dataType='string', required=True)
        else:
            handlerDesc.param(param.identifier(), param.description,
                              dataType='string', required=True)


def _addIndexedInputParamsToTaskSpec(index_input_params, taskSpec):

    for param in index_input_params:
        # print 'in _addIndexedInputParamsToTaskSpec to _createIndexedParamTaskSpec param is '
        # print param # directory parameter 'inputMultipleImage'
        # add to task spec
        curTaskSpec = _createIndexedParamTaskSpec(param)
        taskSpec['inputs'].append(curTaskSpec)


def _addIndexedOutputParamsToHandler(index_output_params, handlerDesc):

    for param in index_output_params:
        if param.flag == '-item':
            _girderOutputItemSuffix = '_girderItemId'
        # add param for parent folder to route description
            handlerDesc.param(param.identifier() + _girderOutputItemSuffix,
                              'Girder ID of parent item '
                              'for output %s - %s: %s'
                              % (param.typ, param.typ, param.description),
                              dataType='string', required=True)
        else:
            handlerDesc.param(param.identifier() + _girderOutputFolderSuffix,
                              'Girder ID of parent folder '
                              'for output %s - %s: %s'
                              % (param.typ, param.typ, param.description),
                              dataType='string', required=True)

        # add param for name of current output to route description
        handlerDesc.param(param.identifier() + _girderOutputNameSuffix,
                          'Name of output %s - %s: %s'
                          % (param.typ, param.identifier(), param.description),
                          dataType='string', required=True)


def _addIndexedOutputParamsToTaskSpec(index_output_params, taskSpec, hargs):

    for param in index_output_params:
        print param
        # add to task spec
        curTaskSpec = _createIndexedParamTaskSpec(param)

        curTaskSpec['path'] =\
            hargs['params'][param.identifier() + _girderOutputNameSuffix]

        taskSpec['outputs'].append(curTaskSpec)


def _getParamDefaultVal(param):

    if param.default is not None:
        return param.default
    elif param.typ == 'boolean':
        return False
    elif param.isVector():
        return None
    elif param.isExternalType():
        return ""
    else:
        raise Exception(
            'optional parameters of type %s must '
            'provide a default value in the xml' % param.typ)


def _createOptionalParamTaskSpec(param):
    """Creates task spec for optional parameters

    Parameters
    ----------
    param : ctk_cli.CLIParameter
        parameter for which the task spec should be created

    """

    curTaskSpec = dict()
    curTaskSpec['id'] = param.identifier()
    curTaskSpec['type'] = _SLICER_TO_GIRDER_WORKER_TYPE_MAP[param.typ]
    curTaskSpec['format'] = _SLICER_TO_GIRDER_WORKER_TYPE_MAP[param.typ]

    if param.isExternalType():
        curTaskSpec['target'] = 'filepath'  # check

    if param.channel != 'output':

        defaultValSpec = dict()
        defaultValSpec['format'] = curTaskSpec['format']
        defaultValSpec['data'] = _getParamDefaultVal(param)
        curTaskSpec['default'] = defaultValSpec

    return curTaskSpec


def _addOptionalInputParamsToHandler(opt_input_params, handlerDesc):

    for param in opt_input_params:

        # add to route description
        defaultVal = _getParamDefaultVal(param)

        if param.isExternalType():
            suffix = _SLICER_TYPE_TO_GIRDER_INPUT_SUFFIX_MAP[param.typ]
            handlerDesc.param(param.identifier() + suffix,
                              'Girder ID of input %s - %s: %s'
                              % (param.typ, param.identifier(), param.description),
                              dataType='string',
                              required=False)
        else:
            handlerDesc.param(param.identifier(), param.description,
                              dataType='string',
                              default=json.dumps(defaultVal),
                              required=False)


def _addOptionalInputParamsToTaskSpec(opt_input_params, taskSpec):

    for param in opt_input_params:

        # add to task spec
        curTaskSpec = _createOptionalParamTaskSpec(param)
        taskSpec['inputs'].append(curTaskSpec)


def _addOptionalOutputParamsToHandler(opt_output_params, handlerDesc):

    for param in opt_output_params:
        if not param.isExternalType():
            continue

        # add param for parent folder to route description
        handlerDesc.param(param.identifier() + _girderOutputFolderSuffix,
                          'Girder ID of parent folder '
                          'for output %s - %s: %s'
                          % (param.typ, param.identifier(), param.description),
                          dataType='string',
                          required=False)

        # add param for name of current output to route description
        handlerDesc.param(param.identifier() + _girderOutputNameSuffix,
                          'Name of output %s - %s: %s'
                          % (param.typ, param.identifier(), param.description),
                          dataType='string', required=False)


def _addOptionalOutputParamsToTaskSpec(opt_output_params, taskSpec, hargs):

    for param in opt_output_params:

        if not param.isExternalType():
            continue

        # set path if it was requested in the REST request
        if (param.identifier() + _girderOutputFolderSuffix not in hargs['params'] or # noqa
                param.identifier() + _girderOutputNameSuffix not in hargs['params']): # noqa
            continue

        # add to task spec
        curTaskSpec = _createOptionalParamTaskSpec(param)

        curTaskSpec['path'] =\
            hargs['params'][param.identifier() + _girderOutputNameSuffix]

        taskSpec['outputs'].append(curTaskSpec)


def _addReturnParameterFileParamToHandler(handlerDesc):

    curName = _return_parameter_file_name
    curType = 'file'
    curDesc = _return_parameter_file_desc

    # add param for parent folder to route description
    handlerDesc.param(curName + _girderOutputFolderSuffix,
                      'Girder ID of parent folder '
                      'for output %s - %s: %s'
                      % (curType, curName, curDesc),
                      dataType='string',
                      required=False)

    # add param for name of current output to route description
    handlerDesc.param(curName + _girderOutputNameSuffix,
                      'Name of output %s - %s: %s'
                      % (curType, curName, curDesc),
                      dataType='string', required=False)


def _addReturnParameterFileParamToTaskSpec(taskSpec, hargs):

    curName = _return_parameter_file_name
    curType = 'file'

    # check if return parameter file was requested in the REST request
    if (curName + _girderOutputFolderSuffix not in hargs['params'] or # noqa
            curName + _girderOutputNameSuffix not in hargs['params']): # noqa
        return

    # add to task spec
    curTaskSpec = dict()
    curTaskSpec['id'] = curName
    curTaskSpec['type'] = _SLICER_TO_GIRDER_WORKER_TYPE_MAP[curType]
    curTaskSpec['format'] = _SLICER_TO_GIRDER_WORKER_TYPE_MAP[curType]
    curTaskSpec['target'] = 'filepath'  # check
    curTaskSpec['path'] =\
        hargs['params'][curName + _girderOutputNameSuffix]

    taskSpec['outputs'].append(curTaskSpec)


def _createInputParamBindingSpec(param, hargs, token):
    # print 'in _createInputParamBindingSpec param is '
    # print param #directory parameter 'inputMultipleImage'
    # /integer parameter 'upperBound'/integer parameter 'lowerBound'
    curBindingSpec = dict()
    if _is_on_girder(param):
        if _SLICER_TYPE_TO_GIRDER_MODEL_MAP[param.typ] == 'url':

            url = hargs['params']['url'].replace('"', '')
            curBindingSpec = wutils.httpInputSpec(url)
        else:
            if param.flag == '-item':
                curBindingSpec = wutils.girderInputSpec(
                    hargs[param.identifier()],
                    resourceType='item',
                    dataType='string', dataFormat='string',
                    token=token, fetchParent=True)
            else:
                curBindingSpec = wutils.girderInputSpec(
                    hargs[param.identifier()],
                    resourceType=_SLICER_TYPE_TO_GIRDER_MODEL_MAP[param.typ],
                    dataType='string', dataFormat='string',
                    token=token, fetchParent=True)
    else:
        # inputs that are not of type image, file, or directory
        # should be passed inline as string from json.dumps()
        curBindingSpec['mode'] = 'inline'
        curBindingSpec['type'] = _SLICER_TO_GIRDER_WORKER_TYPE_MAP[param.typ]
        curBindingSpec['format'] = 'json'
        curBindingSpec['data'] = hargs['params'][param.identifier()]

    return curBindingSpec


def _createOutputParamBindingSpec(param, hargs, user, token):
    # print '---------------------------------400---------------------------------'
    # print param.flag
    if param.flag == '-item':
        curBindingSpec = wutils.girderOutputSpec(
            hargs[param.identifier()],
            token,
            parentType='item',
            name=hargs['params'][param.identifier() + _girderOutputNameSuffix],
            dataType='string', dataFormat='string'
        )
    else:
        curBindingSpec = wutils.girderOutputSpec(
            hargs[param.identifier()],
            token,
            parentType='folder',
            name=hargs['params'][param.identifier() + _girderOutputNameSuffix],
            dataType='string', dataFormat='string'
        )

    if param.isExternalType() and param.reference is not None:

        if param.reference not in hargs:
            raise Exception(
                'Error: The specified reference attribute value'
                '%s for parameter %s is not a valid input' % (
                    param.reference, param.identifier())
            )

        curBindingSpec['reference'] = json.dumps({
            'itemId': str(hargs[param.reference]['_id']),
            'userId': str(user['_id']),
            'identifier': param.identifier()
        })

    return curBindingSpec


def _addIndexedInputParamBindings(index_input_params, bspec, hargs, token):

    for param in index_input_params:
        bspec[param.identifier()] = _createInputParamBindingSpec(param, hargs, token)


def _addIndexedOutputParamBindings(index_output_params,
                                   bspec, hargs, user, token):

    for param in index_output_params:
        bspec[param.identifier()] = _createOutputParamBindingSpec(
            param, hargs, user, token)


def _addOptionalInputParamBindings(opt_input_params, bspec, hargs, user, token):

    for param in opt_input_params:

        if _is_on_girder(param):
            suffix = _SLICER_TYPE_TO_GIRDER_INPUT_SUFFIX_MAP[param.typ]
            if param.identifier() + suffix not in hargs['params']:
                continue

            curModelName = _SLICER_TYPE_TO_GIRDER_MODEL_MAP[param.typ]
            if curModelName == 'url':
                # print 'curModelName == url'
                # print hargs['params']
                hargs[param.identifier()] = hargs['params']['URL(Region)']
            else:
                # print 'curModelName != url'
                # print curModelName
                curModel = ModelImporter.model(curModelName)
                curId = hargs['params'][param.identifier() + suffix]

                hargs[param.identifier()] = curModel.load(id=curId,
                                                          level=AccessType.READ,
                                                          user=user)

        bspec[param.identifier()] = _createInputParamBindingSpec(param, hargs, token)


def _addOptionalOutputParamBindings(opt_output_params,
                                    bspec, hargs, user, token):

    for param in opt_output_params:

        if not _is_on_girder(param):
            continue

        # check if it was requested in the REST request
        if (param.identifier() + _girderOutputFolderSuffix not in hargs['params'] or # noqa
                param.identifier() + _girderOutputNameSuffix not in hargs['params']): # noqa
            continue

        curModel = ModelImporter.model('folder')
        curId = hargs['params'][param.identifier() + _girderOutputFolderSuffix]

        hargs[param.identifier()] = curModel.load(id=curId,
                                                  level=AccessType.WRITE,
                                                  user=user)

        bspec[param.identifier()] = _createOutputParamBindingSpec(param, hargs,
                                                                  user, token)


def _addReturnParameterFileBinding(bspec, hargs, user, token):

    curName = _return_parameter_file_name

    # check if return parameter file was requested in the REST request
    if (curName + _girderOutputFolderSuffix not in hargs['params'] or # noqa
            curName + _girderOutputNameSuffix not in hargs['params']): # noqa
        return

    curModel = ModelImporter.model('folder')
    curId = hargs['params'][curName + _girderOutputFolderSuffix]

    hargs[curName] = curModel.load(id=curId,
                                   level=AccessType.WRITE,
                                   user=user)

    curBindingSpec = wutils.girderOutputSpec(
        hargs[curName],
        token,
        name=hargs['params'][curName + _girderOutputNameSuffix],
        dataType='string', dataFormat='string'
    )

    bspec[curName] = curBindingSpec


def _is_on_girder(param):
    return param.typ in _SLICER_TYPE_TO_GIRDER_MODEL_MAP


def _getParamCommandLineValue(param, value):
    if param.isVector():
        cmdVal = '%s' % ', '.join(map(str, json.loads(value)))
    else:
        cmdVal = str(json.loads(value))

    return cmdVal


def _addOptionalInputParamsToContainerArgs(opt_input_params,
                                           containerArgs, hargs):

    for param in opt_input_params:
        if param.longflag:
            curFlag = param.longflag
        elif param.flag:
            curFlag = param.flag
        else:
            continue

        if _is_on_girder(param) and param.identifier() in hargs:

            curValue = "$input{%s}" % param.identifier()

        elif param.identifier() in hargs['params']:

            try:
                curValue = _getParamCommandLineValue(
                    param, hargs['params'][param.identifier()])
            except Exception:
                logger.exception(
                    'Error: Parameter value is not in json.dumps format\n'
                    '  Parameter name = %r\n  Parameter type = %r\n'
                    '  Value passed = %r', param.identifier(), param.typ,
                    hargs['params'][param.identifier()])
                raise
        else:
            continue

        containerArgs.append(curFlag)
        containerArgs.append(curValue)


def _addOptionalOutputParamsToContainerArgs(opt_output_params,
                                            containerArgs, kwargs, hargs):

    for param in opt_output_params:

        if param.longflag:
            curFlag = param.longflag
        elif param.flag:
            curFlag = param.flag
        else:
            continue

        if _is_on_girder(param) and param.identifier() in kwargs['outputs']:

            curValue = os.path.join(
                _worker_docker_data_dir,
                hargs['params'][param.identifier() + _girderOutputNameSuffix]
            )

            containerArgs.append(curFlag)
            containerArgs.append(curValue)


def _addReturnParameterFileToContainerArgs(containerArgs, kwargs, hargs):

    curName = _return_parameter_file_name

    if curName in kwargs['outputs']:

        curFlag = '--returnparameterfile'

        curValue = os.path.join(
            _worker_docker_data_dir,
            hargs['params'][curName + _girderOutputNameSuffix]
        )

        containerArgs.append(curFlag)
        containerArgs.append(curValue)


def _addIndexedParamsToContainerArgs(index_params, containerArgs, hargs):

    for param in index_params:

        if param.channel != 'output':

            if _is_on_girder(param):
                curValue = "$input{%s}" % param.identifier()
            else:
                curValue = _getParamCommandLineValue(
                    param,
                    hargs['params'][param.identifier()]
                )

        else:

            if not _is_on_girder(param):
                raise Exception(
                    'The type of indexed output parameter %d '
                    'must be of type - %s' % (
                        param.index,
                        _SLICER_TYPE_TO_GIRDER_MODEL_MAP.keys()
                    )
                )

            curValue = os.path.join(
                _worker_docker_data_dir,
                hargs['params'][param.identifier() + _girderOutputNameSuffix]
            )

        # print 'containerArgs'
        # print containerArgs
        containerArgs.append(curValue)


def genHandlerToRunDockerCLI(dockerImage, cliRelPath, cliXML, restResource): # noqa
    """Generates a handler to run docker CLI using girder_worker

    Parameters
    ----------
    dockerImage : str
        Docker image in which the CLI resides
    cliRelPath : str
        Relative path of the CLI which is needed to run the CLI by running
        the command docker run `dockerImage` `cliRelPath`
    cliXML:str
        Cached copy of xml spec for this cli
    restResource : girder.api.rest.Resource
        The object of a class derived from girder.api.rest.Resource to which
        this handler will be attached

    Returns
    -------
    function
        Returns a function that runs the CLI using girder_worker

    """

    cliName = os.path.normpath(cliRelPath).replace(os.sep, '.')

    # get xml spec
    str_xml = cliXML
    # parse cli xml spec
    with tempfile.NamedTemporaryFile(suffix='.xml') as f:
        f.write(str_xml)
        f.flush()
        clim = CLIModule(f.name)

    # create CLI description string
    str_description = ['Description: <br/><br/>' + clim.description]

    if clim.version is not None and len(clim.version) > 0:
        str_description.append('Version: ' + clim.version)

    if clim.license is not None and len(clim.license) > 0:
        str_description.append('License: ' + clim.license)

    if clim.contributor is not None and len(clim.contributor) > 0:
        str_description.append('Author(s): ' + clim.contributor)

    if clim.acknowledgements is not None and \
       len(clim.acknowledgements) > 0:
        str_description.append(
            'Acknowledgements: ' + clim.acknowledgements)

    str_description = '<br/><br/>'.join(str_description)

    # do stuff needed to create REST endpoint for cLI
    handlerDesc = Description(clim.title).notes(str_description)

    # print handlerDesc
    # get CLI parameters
    index_params, opt_params, simple_out_params = _getCLIParameters(clim)

    # print index_params [<CLIParameter 'inputMultipleImage' of type directory>,
    # <CLIParameter 'outputThresholding' of type file>, <CLIParameter 'tableFile' of type file>]
    # add indexed input parameters
    index_input_params = filter(lambda p: p.channel != 'output', index_params)
    # print index_input_params
    # print index_input_params [<CLIParameter 'inputMultipleImage' of type directory>]
    _addIndexedInputParamsToHandler(index_input_params, handlerDesc)

    # add indexed output parameters
    index_output_params = filter(lambda p: p.channel == 'output', index_params)

    _addIndexedOutputParamsToHandler(index_output_params, handlerDesc)

    # add optional input parameters
    opt_input_params = filter(lambda p: p.channel != 'output', opt_params)

    _addOptionalInputParamsToHandler(opt_input_params, handlerDesc)

    # add optional output parameters
    opt_output_params = filter(lambda p: p.channel == 'output', opt_params)

    _addOptionalOutputParamsToHandler(opt_output_params, handlerDesc)
    # print simple_out_params
    # add returnparameterfile if there are simple output params
    if len(simple_out_params) > 0:
        _addReturnParameterFileParamToHandler(handlerDesc)

    # define CLI handler function
    @boundHandler(restResource)
    @access.user
    @describeRoute(handlerDesc)
    def cliHandler(self, **hargs):
        # print 'in cliHandler hargs is '
        # print hargs
        user = self.getCurrentUser()
        token = self.getCurrentToken()['_id']

        # create job
        jobModel = self.model('job', 'jobs')
        jobTitle = '.'.join((restResource.resourceName, cliName))

        # User Group access control,
        # register group into particular job so that this user can access this job
        groups = list(Group().list(user=user))

        groupsAccess = []
        for eachGroup in groups:
            eachGroupAccess = {'id': eachGroup['_id'], 'level': 0}
            groupsAccess.append(eachGroupAccess)

        job = jobModel.createJob(title=jobTitle,
                                 type=jobTitle,
                                 handler='worker_handler',
                                 user=user,
                                 otherFields={'access': {'groups': groupsAccess}})
        kwargs = {
            'validate': False,
            'auto_convert': True,
            'cleanup': True,
            'inputs': dict(),
            'outputs': dict()
        }

        # create job info
        jobToken = jobModel.createJobToken(job)
        kwargs['jobInfo'] = wutils.jobInfoSpec(job, jobToken)

        # initialize task spec
        taskSpec = {'name': cliName,
                    'mode': 'docker',
                    'docker_image': dockerImage,
                    'pull_image': False,
                    'inputs': [],
                    'outputs': []}

        _addIndexedInputParamsToTaskSpec(index_input_params, taskSpec)

        _addIndexedOutputParamsToTaskSpec(index_output_params, taskSpec, hargs)

        _addOptionalInputParamsToTaskSpec(opt_input_params, taskSpec)

        _addOptionalOutputParamsToTaskSpec(opt_output_params, taskSpec, hargs)

        if len(simple_out_params) > 0:
            _addReturnParameterFileParamToTaskSpec(taskSpec, hargs)

        kwargs['task'] = taskSpec

        # add input/output parameter bindings
        _addIndexedInputParamBindings(index_input_params,
                                      kwargs['inputs'], hargs, token)

        _addIndexedOutputParamBindings(index_output_params,
                                       kwargs['outputs'], hargs, user, token)

        _addOptionalInputParamBindings(opt_input_params,
                                       kwargs['inputs'], hargs, user, token)

        _addOptionalOutputParamBindings(opt_output_params,
                                        kwargs['outputs'], hargs, user, token)

        if len(simple_out_params) > 0:
            _addReturnParameterFileBinding(kwargs['outputs'],
                                           hargs, user, token)

        # construct container arguments
        containerArgs = [cliRelPath]

        _addOptionalInputParamsToContainerArgs(opt_input_params,
                                               containerArgs, hargs)

        _addOptionalOutputParamsToContainerArgs(opt_output_params,
                                                containerArgs, kwargs, hargs)

        _addReturnParameterFileToContainerArgs(containerArgs, kwargs, hargs)

        # print 'index_params'
        # print index_params
        _addIndexedParamsToContainerArgs(index_params,
                                         containerArgs, hargs)

        taskSpec['container_args'] = containerArgs

        # schedule job
        job['kwargs'] = kwargs
        # print '-------job is-------'
        # print job
        job = jobModel.save(job)
        jobModel.scheduleJob(job)

        # return result
        return jobModel.filter(job, user)

    handlerFunc = cliHandler
    # print _is_on_girder
    # loadmodel stuff for indexed input params on girder
    index_input_params_on_girder = filter(_is_on_girder, index_input_params)
    # print '---------'
    # print index_input_params_on_girder
    for param in index_input_params_on_girder:
        if param.flag == '-item':
            curModel = 'item'
            # print curModel
            if curModel != 'url':

                suffix = '_girderItemId'
                curMap = {param.identifier() + suffix: param.identifier()}
                # print curMap
                handlerFunc = loadmodel(map=curMap,
                                        model=curModel,
                                        level=AccessType.READ)(handlerFunc)
        else:
            curModel = _SLICER_TYPE_TO_GIRDER_MODEL_MAP[param.typ]
            # print curModel
            if curModel != 'url':

                suffix = _SLICER_TYPE_TO_GIRDER_INPUT_SUFFIX_MAP[param.typ]
                curMap = {param.identifier() + suffix: param.identifier()}
            #    print curMap
                handlerFunc = loadmodel(map=curMap,
                                        model=curModel,
                                        level=AccessType.READ)(handlerFunc)

    # loadmodel stuff for indexed output params on girder
    index_output_params_on_girder = filter(_is_on_girder, index_output_params)

    for param in index_output_params_on_girder:
        if param.flag == '-item':
            _girderOutputItemSuffix = '_girderItemId'
            curModel = 'item'
            curMap = {param.identifier() + _girderOutputItemSuffix: param.identifier()}
        else:
            curModel = 'folder'
            curMap = {param.identifier() + _girderOutputFolderSuffix: param.identifier()}
        handlerFunc = loadmodel(map=curMap,
                                model=curModel,
                                level=AccessType.WRITE)(handlerFunc)

    return handlerFunc


def genHandlerToGetDockerCLIXmlSpec(cliRelPath, cliXML, restResource):
    """Generates a handler that returns the XML spec of the docker CLI

    Parameters
    ----------
    dockerImage : str
        Docker image in which the CLI resides
    cliRelPath : str
        Relative path of the CLI which is needed to run the CLI by running
        the command docker run `dockerImage` `cliRelPath`
    cliXML: str
        value of clispec stored in settings
    restResource : girder.api.rest.Resource
        The object of a class derived from girder.api.rest.Resource to which
        this handler will be attached

    Returns
    -------
    function
        Returns a function that returns the xml spec of the CLI

    """

    str_xml = cliXML
    if isinstance(str_xml, six.text_type):
        str_xml = str_xml.encode('utf8')

    # define the handler that returns the CLI's xml spec
    @boundHandler(restResource)
    @access.user
    @describeRoute(
        Description('Get XML spec of %s CLI' % cliRelPath)
    )
    def getXMLSpecHandler(self, *args, **kwargs):
        setResponseHeader('Content-Type', 'application/xml')
        setRawResponse()
        return str_xml

    return getXMLSpecHandler


def genRESTEndPointsForSlicerCLIsInDocker(info, restResource, dockerImages):
    """Generates REST end points for slicer CLIs placed in subdirectories of a
    given root directory and attaches them to a REST resource with the given
    name.

    For each CLI, it creates:
    * a GET Route (<apiURL>/`restResourceName`/<cliRelativePath>/xmlspec)
    that returns the xml spec of the CLI
    * a POST Route (<apiURL>/`restResourceName`/<cliRelativePath>/run)
    that runs the CLI

    It also creates a GET route (<apiURL>/`restResourceName`) that returns a
    list of relative routes to all CLIs attached to the generated REST resource

    Parameters
    ----------
    info
    restResource : str or girder.api.rest.Resource
        REST resource to which the end-points should be attached
    dockerImages : a list of docker image names

    """
    dockerImages
    # validate restResource argument
    if not isinstance(restResource, (str, Resource)):
        raise Exception('restResource must either be a string or '
                        'an object of girder.api.rest.Resource')

    # validate dockerImages arguments
    if not isinstance(dockerImages, (str, list)):
        raise Exception('dockerImages must either be a single docker image '
                        'string or a list of docker image strings')

    if isinstance(dockerImages, list):
        for img in dockerImages:
            if not isinstance(img, str):
                raise Exception('dockerImages must either be a single '
                                'docker image string or a list of docker '
                                'image strings')
    else:
        dockerImages = [dockerImages]

    # create REST resource if given a name
    if isinstance(restResource, str):
        restResource = type(restResource,
                            (Resource, ),
                            {'resourceName': restResource})()

    restResourceName = type(restResource).__name__

    # Add REST routes for slicer CLIs in each docker image
    cliList = []

    for dimg in dockerImages:
        # check if the docker image exists

        getDockerImage(dimg, True)

        # get CLI list
        cliListSpec = getDockerImageCLIList(dimg)

        cliListSpec = json.loads(cliListSpec)

        # Add REST end-point for each CLI
        for cliRelPath in cliListSpec.keys():
            cliXML = getDockerImageCLIXMLSpec(dimg, cliRelPath)
            # create a POST REST route that runs the CLI
            try:

                cliRunHandler = genHandlerToRunDockerCLI(dimg,
                                                         cliRelPath,
                                                         cliXML,
                                                         restResource)
            except Exception:
                logger.execption('Failed to create REST endpoints for %s',
                                 cliRelPath)
                continue

            cliSuffix = os.path.normpath(cliRelPath).replace(os.sep, '_')

            cliRunHandlerName = 'run_' + cliSuffix
            setattr(restResource, cliRunHandlerName, cliRunHandler)
            restResource.route('POST',
                               (cliRelPath, 'run'),
                               getattr(restResource, cliRunHandlerName))

            # create GET REST route that returns the xml of the CLI
            try:
                cliGetXMLSpecHandler = genHandlerToGetDockerCLIXmlSpec(
                    cliRelPath, cliXML, restResource)

            except Exception:
                logger.exception('Failed to create REST endpoints for %s',
                                 cliRelPath)
                exc_type, exc_obj, exc_tb = sys.exc_info()
                fname = os.path.split(exc_tb.tb_frame.f_code.co_filename)[1]
                logger.error('%r' % [exc_type, fname, exc_tb.tb_lineno])
                continue

            cliGetXMLSpecHandlerName = 'get_xml_' + cliSuffix
            setattr(restResource,
                    cliGetXMLSpecHandlerName,
                    cliGetXMLSpecHandler)
            restResource.route('GET',
                               (cliRelPath, 'xmlspec',),
                               getattr(restResource, cliGetXMLSpecHandlerName))

            cliList.append(cliRelPath)

    # create GET route that returns a list of relative routes to all CLIs
    @boundHandler(restResource)
    @access.user
    @describeRoute(
        Description('Get list of relative routes to all CLIs')
    )
    def getCLIListHandler(self, *args, **kwargs):
        return cliList

    getCLIListHandlerName = 'get_cli_list'
    setattr(restResource, getCLIListHandlerName, getCLIListHandler)
    restResource.route('GET', (), getattr(restResource, getCLIListHandlerName))

    # expose the generated REST resource via apiRoot
    setattr(info['apiRoot'], restResourceName, restResource)

    # return restResource
    return restResource


def genRESTEndPointsForSlicerCLIsInDockerCache(restResource, dockerCache): # noqa
    """Generates REST end points for slicer CLIs placed in subdirectories of a
    given root directory and attaches them to a REST resource with the given
    name.

    For each CLI, it creates:
    * a GET Route (<apiURL>/`restResourceName`/<cliRelativePath>/xmlspec)
    that returns the xml spec of the CLI
    * a POST Route (<apiURL>/`restResourceName`/<cliRelativePath>/run)
    that runs the CLI

    It also creates a GET route (<apiURL>/`restResourceName`) that returns a
    list of relative routes to all CLIs attached to the generated REST resource

    Parameters
    ----------
    restResource : a dockerResource
        REST resource to which the end-points should be attached
    dockerCache : DockerCache object representing data stored in settings

    """

    dockerImages = dockerCache.getImageNames()
    # print '------resourceName is-------'
    # print restResource.resourceName
    # validate restResource argument
    if not isinstance(restResource, Resource):
        raise Exception('restResource must be a '
                        'Docker Resource')

    for dimg in dockerImages:
        # print '------tag is-------'
        # print dimg[dimg.find(':')+1:]
        if restResource.resourceName != 'slicer_cli_web_SSR':
            if restResource.resourceName == dimg[dimg.find(':')+1:]:
                # print 'register Images',dimg[:dimg.find(':')],'in',restResource.resourceName
                docker_image = dockerCache.getImageByName(dimg)
                # get CLI list
                cliListSpec = docker_image.getCLIListSpec()

                # Add REST end-point for each CLI
                for cliRelPath in cliListSpec.keys():
                    restPath = dimg.replace(
                        ':', '_').replace('/', '_').replace('@', '_')
                    # create a POST REST route that runs the CLI
                    try:
                        cliXML = docker_image.getCLIXML(cliRelPath)

                        cliRunHandler = genHandlerToRunDockerCLI(dimg,
                                                                 cliRelPath,
                                                                 cliXML,
                                                                 restResource)

                    except Exception:
                        logger.exception('Failed to create REST endpoints for %r',
                                         cliRelPath)
                        continue

                    cliSuffix = os.path.normpath(cliRelPath).replace(os.sep, '_')

                    cliRunHandlerName = restPath+'_run_' + cliSuffix
                    setattr(restResource, cliRunHandlerName, cliRunHandler)
                    restResource.route('POST',
                                       (restPath, cliRelPath, 'run'),
                                       getattr(restResource, cliRunHandlerName))

                    # store new rest endpoint
                    restResource.storeEndpoints(
                        dimg, cliRelPath, 'run', ['POST', (restPath, cliRelPath, 'run'),
                                                  cliRunHandlerName])

                    # create GET REST route that returns the xml of the CLI
                    try:
                        cliGetXMLSpecHandler = genHandlerToGetDockerCLIXmlSpec(
                            cliRelPath, cliXML,
                            restResource)
                    except Exception:
                        logger.exception('Failed to create REST endpoints for %s',
                                         cliRelPath)
                        exc_type, exc_obj, exc_tb = sys.exc_info()
                        fname = os.path.split(exc_tb.tb_frame.f_code.co_filename)[1]
                        logger.error('%r', [exc_type, fname, exc_tb.tb_lineno])
                        continue

                    cliGetXMLSpecHandlerName = restPath+'_get_xml_' + cliSuffix
                    setattr(restResource,
                            cliGetXMLSpecHandlerName,
                            cliGetXMLSpecHandler)
                    restResource.route('GET',
                                       (restPath, cliRelPath, 'xmlspec',),
                                       getattr(restResource, cliGetXMLSpecHandlerName))

                    restResource.storeEndpoints(
                        dimg, cliRelPath, 'xmlspec',
                        ['GET', (restPath, cliRelPath, 'xmlspec'),
                         cliGetXMLSpecHandlerName])
                    logger.debug('Created REST endpoints for %s', cliRelPath)

        else:
            # print 'register all in',restResource.resourceName
            docker_image = dockerCache.getImageByName(dimg)
            # get CLI list
            cliListSpec = docker_image.getCLIListSpec()

            # Add REST end-point for each CLI
            for cliRelPath in cliListSpec.keys():
                restPath = dimg.replace(
                    ':', '_').replace('/', '_').replace('@', '_')
                # create a POST REST route that runs the CLI
                try:
                    cliXML = docker_image.getCLIXML(cliRelPath)

                    cliRunHandler = genHandlerToRunDockerCLI(dimg,
                                                             cliRelPath,
                                                             cliXML,
                                                             restResource)

                except Exception:
                    logger.exception('Failed to create REST endpoints for %r',
                                     cliRelPath)
                    continue

                cliSuffix = os.path.normpath(cliRelPath).replace(os.sep, '_')

                cliRunHandlerName = restPath+'_run_' + cliSuffix
                setattr(restResource, cliRunHandlerName, cliRunHandler)
                restResource.route('POST',
                                   (restPath, cliRelPath, 'run'),
                                   getattr(restResource, cliRunHandlerName))

                # store new rest endpoint
                restResource.storeEndpoints(
                    dimg, cliRelPath, 'run', ['POST', (restPath, cliRelPath, 'run'),
                                              cliRunHandlerName])

                # create GET REST route that returns the xml of the CLI
                try:
                    cliGetXMLSpecHandler = genHandlerToGetDockerCLIXmlSpec(
                        cliRelPath, cliXML,
                        restResource)
                except Exception:
                    logger.exception('Failed to create REST endpoints for %s',
                                     cliRelPath)
                    exc_type, exc_obj, exc_tb = sys.exc_info()
                    fname = os.path.split(exc_tb.tb_frame.f_code.co_filename)[1]
                    logger.error('%r', [exc_type, fname, exc_tb.tb_lineno])
                    continue

                cliGetXMLSpecHandlerName = restPath+'_get_xml_' + cliSuffix
                setattr(restResource,
                        cliGetXMLSpecHandlerName,
                        cliGetXMLSpecHandler)
                restResource.route('GET',
                                   (restPath, cliRelPath, 'xmlspec',),
                                   getattr(restResource, cliGetXMLSpecHandlerName))

                restResource.storeEndpoints(
                    dimg, cliRelPath, 'xmlspec',
                    ['GET', (restPath, cliRelPath, 'xmlspec'),
                     cliGetXMLSpecHandlerName])
                logger.debug('Created REST endpoints for %s', cliRelPath)

    return restResource


def getDockerImage(imageName, pullIfNotExist=False):
    """
    Checks the local docker cache for the image

    :param imageName: the docker image name in the form of repo/name:tag
    if the tag is not given docker defaults to using the :latest tag
    :type imageName: string
    :returns: if the image exists the id(sha256 hash) is returned otherwise
    None is returned
    """
    try:
        # docker inspect returns non zero if the image is not available
        # locally
        data = subprocess.check_output(['docker', 'inspect',
                                        '--format="{{json .Id}}"', imageName])

        return data
    except subprocess.CalledProcessError:
        if pullIfNotExist:
            # the image does not exist locally, try to pull from dockerhub
            # none is returned if it fails
            data = pullDockerImage(imageName)
            return data
        raise Exception("cant find the image %s" % imageName)


def getDockerImageCLIList(imageName):
    """
    Gets the cli list of the docker image
    :param imageName: the docker image name in the form of repo/name:tag
    :type imageName: string
    :returns: if the image exist the cli dictionary is returned otherwise
    None is returned
    cli dictionary format is the following:
    {
    <cli_name>:{
                type:<type>
                }

    }
    """
    try:
        # docker inspect returns non zero if the image is not available
        # locally
        data = subprocess.check_output(
            ['docker', 'run', '--rm', imageName, '--list_cli'])
        return data
    except subprocess.CalledProcessError:
        # the image does not exist locally, try to pull from dockerhub
        raise Exception("Could not get the cli list for the img %s most "
                        "likely the docker image entrypoint does "
                        "not accept the argument --list_cli" % imageName)


def getDockerImageCLIXMLSpec(img, cli):
    """
    Gets the xml spec of the specific cli

    """
    try:
        data = subprocess.check_output(['docker', 'run', '--rm', img, cli, '--xml'])
        return data
    except subprocess.CalledProcessError:
        # the image does not exist locally, try to pull from dockerhub
        raise Exception('Could not get xml data for img %s '
                        'cli %s' % (img, cli))


def pullDockerImage(img):
    try:
        subprocess.check_output(['docker', 'pull', img])
        data = getDockerImage(img)
        return data
    except subprocess.CalledProcessError:
        # the image does not exist on the default repository

        return None
