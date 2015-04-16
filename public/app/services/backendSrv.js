define([
  'angular',
  'lodash',
  'config',
],
function (angular, _, config) {
  'use strict';

  var module = angular.module('grafana.services');

  module.service('backendSrv', function($http, alertSrv, $timeout) {
    var self = this;

    this.get = function(url, params) {
      return this.request({ method: 'GET', url: url, params: params });
    };

    this.delete = function(url) {
      return this.request({ method: 'DELETE', url: url });
    };

    this.post = function(url, data) {
      return this.request({ method: 'POST', url: url, data: data });
    };

    this.put = function(url, data) {
      return this.request({ method: 'PUT', url: url, data: data });
    };

    this._handleError = function(err) {
      return function() {
        if (err.isHandled) {
          return;
        }

        if (err.status === 422) {
          alertSrv.set("Validation failed", "", "warning", 4000);
          throw err.data;
        }

        var data = err.data || { message: 'Unexpected error' };

        if (_.isString(data)) {
          data = { message: data };
        }

        data.severity = 'error';

        if (err.status < 500) {
          data.severity = "warning";
        }

        if (data.message) {
          alertSrv.set("Problem!", data.message, data.severity, 10000);
        }

        throw data;
      };
    };

    this.request = function(options) {
      options.retry = options.retry || 0;
      var requestIsLocal = options.url.indexOf('/') === 0;
      var firstAttempt = options.retry === 0;

      if (requestIsLocal && firstAttempt) {
        options.url = config.appSubUrl + options.url;
      }

      return $http(options).then(function(results) {
        if (options.method !== 'GET') {
          if (results && results.data.message) {
            alertSrv.set(results.data.message, '', 'success', 3000);
          }
        }
        return results.data;
      }, function(err) {
        // handle unauthorized
        if (err.status === 401 && firstAttempt) {
          return self.loginPing().then(function() {
            options.retry = 1;
            return self.request(options);
          });
        }

        $timeout(self._handleError(err), 50);
        throw err;
      });
    };

    this.datasourceRequest = function(options) {
      options.retry = options.retry || 0;
      var requestIsLocal = options.url.indexOf('/') === 0;
      var firstAttempt = options.retry === 0;

      return $http(options).then(null, function(err) {
        // handle unauthorized for backend requests
        if (requestIsLocal && firstAttempt  && err.status === 401) {
          return self.loginPing().then(function() {
            options.retry = 1;
            return self.datasourceRequest(options);
          });
        }

        throw err;
      });
    };

    this.loginPing = function() {
      return this.request({url: '/api/login/ping', method: 'GET', retry: 1 });
    };

    this.search = function(query) {
      return this.get('/api/search', query);
    };

    this.getDashboard = function(slug) {
      return this.get('/api/dashboards/db/' + slug);
    };

    this.saveDashboard = function(dash, options) {
      options = (options || {});
      return this.post('/api/dashboards/db/', {dashboard: dash, overwrite: options.overwrite === true});
    };

  });
});
