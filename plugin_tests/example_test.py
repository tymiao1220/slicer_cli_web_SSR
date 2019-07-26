#!/usr/bin/env python
# -*- coding: utf-8 -*-

###############################################################################
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
###############################################################################

# This is to serve as an example for how to create a server-side test in a
# girder plugin, it is not meant to be useful.

from tests import base


# boiler plate to start and stop the server
def setUpModule():
    base.enabledPlugins.append('slicer_cli_web_ssr')
    base.startServer()


def tearDownModule():
    base.stopServer()


class ExampleTest(base.TestCase):

    def testExample(self):
        resp = self.request(path='/user/me')
        self.assertStatus(resp, 200)
