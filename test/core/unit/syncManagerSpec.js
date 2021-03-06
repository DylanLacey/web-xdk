/* eslint-disable */
describe("The SyncManager Class", function() {
    var socket, client, syncManager;
    var appId = "Fred's App";

    beforeEach(function() {
        jasmine.clock().install();
        jasmine.Ajax.install();
        requests = jasmine.Ajax.requests;
        client = new Layer.Core.Client({
            appId: appId,
            url: "https://huh.com"
        });
        client.sessionToken = "sessionToken";
        client.user = new Layer.Core.Identity({
            userId: "Frodo",
            id: "layer:///identities/" + "Frodo",
            firstName: "first",
            lastName: "last",
            phoneNumber: "phone",
            emailAddress: "email",
            metadata: {},
            publicKey: "public",
            avatarUrl: "avatar",
            displayName: "display",
            syncState: Layer.Constants.SYNC_STATE.SYNCED,
            isFullIdentity: true,
            isMine: true
        });


        client._clientAuthenticated();
        getObjectsResult = [];
        spyOn(client.dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
            setTimeout(function() {
                callback(getObjectsResult);
            }, 10);
        });
        client._clientReady();
        client.onlineManager.isOnline = true;

        conversation = client._createObject(responses.conversation1).conversation;
        requests.reset();
        client.syncManager.queue = [];
        jasmine.clock().tick(1);
        Layer.Utils.defer.flush();
        syncManager = new Layer.Core.SyncManager({
            onlineManager: client.onlineManager,
            socketManager: client.socketManager,
            requestManager: client.socketRequestManager
        });
        client.onlineManager.isOnline = true;
        client.socketManager._socket = {
            send: function() {},
            addEventListener: function() {},
            removeEventListener: function() {},
            close: function() {},
            readyState: WebSocket.OPEN
        };

    });

    afterEach(function() {
        if (!client.isDestroyed) client.destroy();
        if (!syncManager.isDestroyed) syncManager.destroy();
        jasmine.Ajax.uninstall();
        jasmine.clock().uninstall();
    });



    describe("The _handleDeduplicationErrors() method", function() {
      beforeEach(function() {
          syncManager.queue = [new Layer.Core.WebsocketSyncEvent({
              data: {
                method: 'Message.create',
                data: {
                  id: 'myobjid'
                }
              },
              url: "fred2",
              operation: "POST"
          })];
          spyOn(syncManager, "_xhrError");
          spyOn(syncManager, "_xhrSuccess");
      });

      it("Should ignore errors that are not id_in_use", function() {
        var result = {
          success: false,
          data: {
            id: 'fred',
            data: {
              id: 'myobjid'
            }
          },
          request: syncManager.queue[0]
        };
        syncManager._handleDeduplicationErrors(result);
        expect(result.success).toBe(false);
      });

      it("Should ignore errors that are id_in_use but lack an Object", function() {
        var result = {
          success: false,
          data: {
            id: 'id_in_use'
          },
          request: syncManager.queue[0]
        };
        syncManager._handleDeduplicationErrors(result);
        expect(result.success).toBe(false);
      });

      it("Should ignore errors that are id_in_use but lack an Object with matching ID", function() {
        var result = {
          success: false,
          data: {
            id: 'id_in_use',
            data: {
              id: 'myobjid2'
            }
          },
          request: syncManager.queue[0]
        };
        syncManager._handleDeduplicationErrors(result);
        expect(result.success).toBe(false);
      });

      it("Should handle errors marking them as Success", function() {
        var result = {
          success: false,
          data: {
            id: 'id_in_use',
            data: {
              id: 'myobjid'
            }
          },
          request: syncManager.queue[0]
        };
        syncManager._handleDeduplicationErrors(result);
        expect(result.success).toBe(true);
      });

      it("Should handle errors changing data to the Object", function() {
        var result = {
          success: false,
          data: {
            id: 'id_in_use',
            data: {
              id: 'myobjid'
            }
          },
          request: syncManager.queue[0]
        };
        syncManager._handleDeduplicationErrors(result);
        expect(result.data).toEqual({id: 'myobjid'});
      });
    });

    describe("The _xhrSuccess() method", function() {
        var evt;
        beforeEach(function() {
            evt = new Layer.Core.XHRSyncEvent({
                target: "fred"
            });
            syncManager.queue = [evt];
        });

        it("Should set the request success to true", function() {
            expect(evt.success).toEqual(null);
            syncManager._xhrSuccess({request: evt});
            expect(evt.success).toEqual(true);
        });

        it("Should remove the request", function() {
            syncManager._xhrSuccess({request: evt});
            expect(syncManager.queue).toEqual([]);
        });

        it("Should call the request callback", function() {
            evt.callback = jasmine.createSpy('callback');
            var result = {request: evt};
            syncManager._xhrSuccess(result);
            expect(evt.callback).toHaveBeenCalledWith(result);
        });

        it("Should call _processNextRequest", function() {
            spyOn(syncManager, "_processNextRequest");
            syncManager._xhrSuccess({request: evt});
            expect(syncManager._processNextRequest).toHaveBeenCalled();
        });

        it("Should trigger sync:success", function() {
            spyOn(syncManager, "trigger");
            syncManager._xhrSuccess({request: evt, data: "hey"});
            expect(syncManager.trigger).toHaveBeenCalledWith('sync:success', {
              target: "fred",
              request: evt,
              response: "hey",
            });
        });
    });

    describe("The _getErrorState() method", function() {

        it("Should return offline if isOnline is false", function() {
            expect(syncManager._getErrorState({status: 408}, {retryCount: 0}, false)).toEqual("offline");
        });

        it("Should return CORS if isOnline is false and returnToOnlineCount is high", function() {
            expect(syncManager._getErrorState({status: 408}, {retryCount: 0, returnToOnlineCount: 3}, false)).toEqual("CORS");
        });

        it("Should return validateOnlineAndRetry if its a 408 no-response", function() {
            expect(syncManager._getErrorState({status: 408}, {retryCount: 0}, true)).toEqual("validateOnlineAndRetry");
            expect(syncManager._getErrorState({status: 408}, {retryCount: Layer.Core.SyncManager.MAX_RETRIES - 1}, true)).toEqual("validateOnlineAndRetry");
        });

        it("Should return tooManyFailuresWhileOnline if too many 408s", function() {
            expect(syncManager._getErrorState({status: 408}, {retryCount: Layer.Core.SyncManager.MAX_RETRIES }, true)).toEqual("tooManyFailuresWhileOnline");
        });

        it("Should return serverUnavailable for server unavailable errors", function() {
            expect(syncManager._getErrorState({status: 502}, {retryCount: 0}, true)).toEqual("serverUnavailable");
            expect(syncManager._getErrorState({status: 503}, {retryCount: 0}, true)).toEqual("serverUnavailable");
            expect(syncManager._getErrorState({status: 504}, {retryCount: 0}, true)).toEqual("serverUnavailable");
            expect(syncManager._getErrorState({status: 505}, {retryCount: 0}, true)).not.toEqual("serverUnavailable");
        });

        it("Should return tooManyFailuresWhileOnline if too many service unavailables", function() {
            expect(syncManager._getErrorState({status: 503}, {retryCount: Layer.Core.SyncManager.MAX_RETRIES }, true)).toEqual("tooManyFailuresWhileOnline");
        });

        it("Should return notFound if server returns not_found", function() {
            expect(syncManager._getErrorState({status: 404, data: {id: 'not_found'}}, {retryCount: Layer.Core.SyncManager.MAX_RETRIES }, true)).toEqual("notFound");
        });

         it("Should return invalidId if server returns id_in_use", function() {
            expect(syncManager._getErrorState({status: 404, data: {id: 'id_in_use'}}, {retryCount: Layer.Core.SyncManager.MAX_RETRIES }, true)).toEqual("invalidId");
        });

        it("Should return reauthorize if there is a nonce", function() {
            expect(syncManager._getErrorState({status: 401, data: {id: 'authentication_required', data: {nonce: "fred"}}}, {retryCount: 0}, true)).toEqual("reauthorize");
            expect(syncManager._getErrorState({status: 402, data: {id: 'authentication_required', data: {nonce: "fred"}}}, {retryCount: 0}, true)).toEqual("reauthorize");
            expect(syncManager._getErrorState({status: 401, data: {id: 'authentication_required2', data: {nonce: "fred"}}}, {retryCount: 0}, true)).not.toEqual("reauthorize");
        });

        it("Should return serverRejectedRequest for anything else", function() {
            expect(syncManager._getErrorState({status: 404}, {retryCount: 0}, true)).toEqual("serverRejectedRequest");
            expect(syncManager._getErrorState({status: 405}, {retryCount: 0}, true)).toEqual("serverRejectedRequest");
        });
    });


    describe("The _xhrError() method", function() {
        var request;
        beforeEach(function() {
            syncManager.onlineManager.isOnline = true;
            client._clientReady();
            request = new Layer.Core.XHRSyncEvent({
                operation: "PATCH",
                target: "fred"
            });
            syncManager.queue = [request];
        });

        it("Should call _getErrorState", function() {
            spyOn(syncManager, "_getErrorState");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._getErrorState).toHaveBeenCalledWith(result, request, true);
        });

        it("Should call _xhrHandleServerError if notFound", function() {
            spyOn(syncManager, "_xhrHandleServerError");
            spyOn(syncManager, "_getErrorState").and.returnValue("notFound");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleServerError).toHaveBeenCalledWith(result, jasmine.any(String), false);
        });

        it("Should call _xhrHandleServerError if tooManyFailuresWhileOnline if too many 408s", function() {
            spyOn(syncManager, "_xhrHandleServerError");
            spyOn(syncManager, "_getErrorState").and.returnValue("tooManyFailuresWhileOnline");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleServerError).toHaveBeenCalledWith(result, jasmine.any(String), false);
        });

        it("Should call _xhrHandleServerError if CORS error", function() {
            spyOn(syncManager, "_xhrHandleServerError");
            spyOn(syncManager, "_getErrorState").and.returnValue("CORS");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleServerError).toHaveBeenCalledWith(result, jasmine.any(String), false);
        });

        it("Should call _xhrHandleServerError if invalidId error", function() {
            spyOn(syncManager, "_xhrHandleServerError");
            spyOn(syncManager, "_getErrorState").and.returnValue("invalidId");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleServerError).toHaveBeenCalledWith(result, jasmine.any(String), false);
        });

        it("Should call _xhrValidateIsOnline if validateOnlineAndRetry", function() {
            spyOn(syncManager, "_xhrHandleServerUnavailableError");
            spyOn(syncManager, "_getErrorState").and.returnValue("validateOnlineAndRetry");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleServerUnavailableError).toHaveBeenCalledWith(result);
        });

        it("Should call _xhrHandleServerUnavailableError if serverUnavailable", function() {
            spyOn(syncManager, "_xhrHandleServerUnavailableError");
            spyOn(syncManager, "_getErrorState").and.returnValue("serverUnavailable");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleServerUnavailableError).toHaveBeenCalledWith(result);
        });

        it("Should call callback if reauthorize", function() {
            var spy = request.callback = jasmine.createSpy();
            spyOn(syncManager, "_getErrorState").and.returnValue("reauthorize");
            var result = {request: request};


            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(spy).toHaveBeenCalledWith(result);
        });

        it("Should call _xhrHandleServerError if serverRejectedRequest", function() {
            spyOn(syncManager, "_xhrHandleServerError");
            spyOn(syncManager, "_getErrorState").and.returnValue("serverRejectedRequest");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleServerError).toHaveBeenCalledWith(result, jasmine.any(String), true);
        });

        it("Should call _xhrHandleConnectionError if offline", function() {
            spyOn(syncManager, "_xhrHandleConnectionError");
            spyOn(syncManager, "_getErrorState").and.returnValue("offline");
            var result = {request: request};

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(syncManager._xhrHandleConnectionError).toHaveBeenCalledWith();
        });

        it("Should write failed requests back database if the request wasn't removed from queue", function() {
            spyOn(client.dbManager, "writeSyncEvents");
            var result = {request: request};
            spyOn(syncManager, "_getErrorState").and.returnValue('fred');

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(client.dbManager.writeSyncEvents).toHaveBeenCalledWith([request]);
        });

        it("Should write failed requests back database if the request wasn't removed from receiptQueue", function() {
            spyOn(client.dbManager, "writeSyncEvents");
            var result = {request: request};
            syncManager.queue = [];
            syncManager.receiptQueue = [request];

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(client.dbManager.writeSyncEvents).toHaveBeenCalledWith([request]);
        });

        it("Should not write failed requests back database if the request was removed", function() {
            spyOn(client.dbManager, "writeSyncEvents");
            var result = {request: request};
            syncManager.queue = [];
            syncManager.receiptQueue = [];

            // Run
            syncManager._xhrError(result);

            // Posttest
            expect(client.dbManager.writeSyncEvents).not.toHaveBeenCalled();
        });
    });

    describe("The _xhrHandleServerUnavailableError() method", function() {
        var request, result;
        beforeEach(function() {
            syncManager.onlineManager.isOnline = true;
            request = new Layer.Core.SyncEvent({
                operation: "PATCH",
                target: "fred"
            });
            syncManager.queue = [request];
            result = {
                request: request,
                data: "myerror"
            };
        });

        it("Should default to retryCount of 0", function() {
            expect(request.retryCount).toEqual(0);
        });

        it("Should increment retryCount", function() {
            syncManager._xhrHandleServerUnavailableError(result);
            expect(request.retryCount).toEqual(1);
            syncManager._xhrHandleServerUnavailableError(result);
            expect(request.retryCount).toEqual(2);
            syncManager._xhrHandleServerUnavailableError(result);
            expect(request.retryCount).toEqual(3);
        });

        it("Should call Utils.getExponentialBackoffSeconds with the retryCount", function() {
            var tmp = Layer.Utils.getExponentialBackoffSeconds;
            spyOn(layer.Utils, "getExponentialBackoffSeconds");

            // Run
            syncManager._xhrHandleServerUnavailableError(result);
            expect(Layer.Utils.getExponentialBackoffSeconds).toHaveBeenCalledWith(60, 0);
            syncManager._xhrHandleServerUnavailableError(result);
            expect(Layer.Utils.getExponentialBackoffSeconds).toHaveBeenCalledWith(60, 1);
            syncManager._xhrHandleServerUnavailableError(result);
            expect(Layer.Utils.getExponentialBackoffSeconds).toHaveBeenCalledWith(60, 2);

            // Restore
            Layer.Utils.getExponentialBackoffSeconds = tmp;
        });

        it("Should schedule processNextRequest for backoff seconds", function() {
            var tmp = Layer.Utils.getExponentialBackoffSeconds;
            spyOn(layer.Utils, "getExponentialBackoffSeconds").and.returnValue(15);
            spyOn(syncManager, "_processNextRequest");

            // Run
            syncManager._xhrHandleServerUnavailableError(result);
            jasmine.clock().tick(14999);
            expect(syncManager._processNextRequest).not.toHaveBeenCalled();
            jasmine.clock().tick(2);
            expect(syncManager._processNextRequest).toHaveBeenCalledWith();

            // Restore
            Layer.Utils.getExponentialBackoffSeconds = tmp;
        });

        it("Should trigger a sync:error-will-retry event", function() {
            var response;
            syncManager.on('sync:error-will-retry', function(evt) {
                response = evt;
            });
            syncManager._xhrHandleServerUnavailableError(result);

            expect(response.target).toEqual("fred");
            expect(response.retryCount).toEqual(0);
            expect(response.error).toEqual("myerror");
            expect(response.request).toBe(request);
        });
    });

    describe("The _xhrHandleServerError() method", function() {
        var request, result;
        beforeEach(function() {
            syncManager.onlineManager.isOnline = true;
            client._clientReady();
            request = new Layer.Core.XHRSyncEvent({
                operation: "PATCH",
                target: "fred",
                callback: jasmine.createSpy("callback")
            });
            syncManager.queue = [request];
            result = {
                request: request,
                data: "myerror"
            };
        });

        it("Should call the request callback with the results", function() {
            var spy = request.callback = jasmine.createSpy();

            // Run
            syncManager._xhrHandleServerError(result);

            // Posttest
            expect(spy).toHaveBeenCalledWith(result);
        });

        it("Should trigger a sync:error event", function() {
            spyOn(syncManager, "trigger");

            // Run
            syncManager._xhrHandleServerError(result);

            // Posttest
            expect(syncManager.trigger).toHaveBeenCalledWith("sync:error", {
                target: "fred",
                request: request,
                error: "myerror"
            });
        });

        it("Should call _purgeDependentRequests for POST failures", function() {
            spyOn(syncManager, "_purgeDependentRequests");
            request.operation = "POST";

            // Run
            syncManager._xhrHandleServerError(result);

            // Posttest
            expect(syncManager._purgeDependentRequests).toHaveBeenCalledWith(request);
        });

        it("Should NOT call _purgeDependentRequests for non-POST failures", function() {
            spyOn(syncManager, "_purgeDependentRequests");
            request.operation = "PATCH";

            // Run
            syncManager._xhrHandleServerError(result);

            // Posttest
            expect(syncManager._purgeDependentRequests).not.toHaveBeenCalled();
        });

        it("Should call _removeRequest to remove the failed reqeust", function() {
            spyOn(syncManager, "_removeRequest");

            // Run
            syncManager._xhrHandleServerError(result);

            // Posttest
            expect(syncManager._removeRequest).toHaveBeenCalledWith(request, true);
        });

        it("Should call processNextRequest to start the next request", function() {
            spyOn(syncManager, "_processNextRequest");

            // Run
            syncManager._xhrHandleServerError(result);

            // Posttest
            expect(syncManager._processNextRequest).toHaveBeenCalledWith();
        });
    });

    describe("The _xhrValidateIsOnline() method", function() {
        it("Should call onlineManager.checkOnlineStatus", function() {
            spyOn(syncManager.onlineManager, "checkOnlineStatus");
            syncManager._xhrValidateIsOnline();
            expect(syncManager.onlineManager.checkOnlineStatus).toHaveBeenCalledWith(jasmine.any(Function));
        });

        it("Should call _xhrValidateIsOnlineCallback with the result", function() {
            spyOn(syncManager.onlineManager, "checkOnlineStatus").and.callFake(function(func) {
                func(true);
            });
            spyOn(syncManager, "_xhrValidateIsOnlineCallback");
            var request = new Layer.Core.SyncEvent({});
            syncManager._xhrValidateIsOnline(request);
            expect(syncManager._xhrValidateIsOnlineCallback).toHaveBeenCalledWith(true, request);
        });
    });

    describe("The _xhrValidateIsOnlineCallback() method", function() {
        var request;
        beforeEach(function() {
            syncManager.onlineManager.isOnline = true;
            client._clientReady();
            request = new Layer.Core.XHRSyncEvent({
                operation: "PATCH",
                target: "fred"
            });
            syncManager.queue = [request];
        });
        it("Should call _xhrHandleConnectionError if offline", function() {
            spyOn(syncManager, "_xhrHandleConnectionError");
            syncManager._xhrValidateIsOnlineCallback(false);
            expect(syncManager._xhrHandleConnectionError).toHaveBeenCalledWith();
        });

        it("Should increment retryCount if online", function() {
            syncManager._xhrValidateIsOnlineCallback(true, request);
            expect(request.retryCount).toEqual(1);
            syncManager._xhrValidateIsOnlineCallback(true, request);
            expect(request.retryCount).toEqual(2);
            syncManager._xhrValidateIsOnlineCallback(true, request);
            expect(request.retryCount).toEqual(3);
        })

        it("Should call processNextRequest if online", function() {
            spyOn(syncManager, "_processNextRequest");
            syncManager._xhrValidateIsOnlineCallback(true, request);
            expect(syncManager._processNextRequest).toHaveBeenCalledWith();
        });
    });

    describe("The _removeRequest() method", function() {
        var request;
        beforeEach(function() {
            syncManager.onlineManager.isOnline = true;
            request = new Layer.Core.SyncEvent({
                operation: "PATCH",
                target: "fred"
            });
            syncManager.queue = [request];
        });

        it("Should remove the request from the queue", function() {
            syncManager._removeRequest(request);
            expect(syncManager.queue).toEqual([]);
        });

        it("Should remove the request from the receiptQueue", function() {
            syncManager.receiptQueue = [request];
            syncManager.queue = [];
            request.operation = 'RECEIPT';
            syncManager._removeRequest(request);
            expect(syncManager.queue).toEqual([]);
            expect(syncManager.receiptQueue).toEqual([]);
        });

        it("Should do nothing if request not in the queue", function() {
            var request2 = new Layer.Core.SyncEvent({
                operation: "PATCH",
                target: "fred"
            });
            syncManager._removeRequest(request2);
            expect(syncManager.queue).toEqual([request]);
        });

        it("Should remove the request from the indexedDB if deleteDB true", function() {
            spyOn(client.dbManager, "deleteObjects");
            syncManager._removeRequest(request, true);
            expect(client.dbManager.deleteObjects).toHaveBeenCalledWith('syncQueue', [request]);
        });

        it("Should skip removing the request from the indexedDB if deleteDB false", function() {
            spyOn(client.dbManager, "deleteObjects");
            syncManager._removeRequest(request, false);
            expect(client.dbManager.deleteObjects).not.toHaveBeenCalled();
        });
    });

    describe("The _purgeDependentRequests() method", function() {
        var request1, request2, request3;
        beforeEach(function() {
            syncManager.onlineManager.isOnline = true;
            request1 = new Layer.Core.SyncEvent({
                operation: "PATCH",
                depends: ["fred"]
            });
            request2 = new Layer.Core.SyncEvent({
                operation: "PATCH",
                depends: ["freud"]
            });
            request3 = new Layer.Core.SyncEvent({
                operation: "PATCH",
                depends: ["freud", "fred"]
            });
            syncManager.queue = [request1, request2, request3];
        });

        it("Should remove all requests that share the target", function() {
            syncManager._purgeDependentRequests(new Layer.Core.SyncEvent({target: "fred"}));
            expect(syncManager.queue).toEqual([request2]);
        });

        it("Should leave unrelated requests untouched", function() {
            syncManager._purgeDependentRequests(new Layer.Core.SyncEvent({
                operation: "PATCH",
                target: "jill"
            }));
            expect(syncManager.queue).toEqual([request1, request2, request3]);
        });
    });

    describe("The _purgeOnDelete() method", function() {
        var request1, request2, request3;
        beforeEach(function() {
            syncManager.onlineManager.isOnline = true;
            request1 = new Layer.Core.SyncEvent({
                operation: "PATCH",
                depends: ["fred"]
            });
            request2 = new Layer.Core.SyncEvent({
                operation: "PATCH",
                depends: ["freud", "frozone"]
            });
            request3 = new Layer.Core.SyncEvent({
                operation: "PATCH",
                depends: ["fred", "freud"]
            });
            syncManager.queue = [request1, request2, request3];
        });
        it("Should remove all requests that depend upon the target of the input request", function() {
            syncManager._purgeOnDelete(new Layer.Core.SyncEvent({
                operation: "PATCH",
                target: "fred"
            }));
            expect(syncManager.queue).toEqual([request2]);
        });
    });
    describe("The _loadPersistedQueue() method", function() {
      beforeEach(function() {
        client._clientReady();
      });

      it("Should append to the queue", function() {
        // Setup
        var request = new Layer.Core.XHRSyncEvent({
            operation: "PATCH",
            depends: ["fred"],
            url: ''
        });
        var request2 = new Layer.Core.XHRSyncEvent({
            operation: "PATCH",
            depends: ["fred2"],
            url: ''
        });
        syncManager.queue = [request];
        spyOn(client.dbManager, "loadSyncQueue").and.callFake(function(callback) {
          callback([request2]);
        });

        // Run
        syncManager._loadPersistedQueue();

        // Posttest
        expect(syncManager.queue).toEqual([request, request2]);
      });

      it("Should call processNextRequest", function() {
        // Setup
        var request = new Layer.Core.XHRSyncEvent({
            operation: "PATCH",
            depends: ["fred"],
            url: ''
        });
        var request2 = new Layer.Core.XHRSyncEvent({
            operation: "PATCH",
            depends: ["fred2"],
            url: ''
        });
        syncManager.queue = [request];
        spyOn(client.dbManager, "loadSyncQueue").and.callFake(function(callback) {
          callback([request2]);
        });
        spyOn(syncManager, "_processNextRequest");

        // Run
        syncManager._loadPersistedQueue();

        // Posttest
        expect(syncManager._processNextRequest).toHaveBeenCalledWith();

      });
    });
});