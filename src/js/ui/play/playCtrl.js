var xhr = require('../../xhr');
var roundXhr = require('../round/roundXhr');
var roundCtrl = require('../round/roundCtrl');
var StrongSocket = require('../../StrongSocket');
var Chessground = require('chessground');
var utils = require('../../utils');
var signals = require('../../signals');

function makeGameSocket(ctrl, data) {
  return new StrongSocket(
    data.url.socket,
    data.player.version, {
      options: { name: "game", debug: true, ignoreUnknownMessages: true },
      receive: function(t, d) { return ctrl.round.socket.receive(t, d); },
      events: {
        resync: function() {
          // TODO this is still fired after StrongSocket.destroy()
          // try to understand why
          if (ctrl.gameSocket) {
            roundXhr.reload(ctrl.round).then(function(data) {
              ctrl.gameSocket.reset(data.player.version);
              ctrl.round.reload(data);
            }, function(err) {
              utils.handleXhrError(err);
            });
          }
        }
      }
    }
  );
}

function makeRound(ctrl, data) {
  return new roundCtrl(data, ctrl.gameSocket.send.bind(ctrl.gameSocket));
}

module.exports = function() {

  this.id = m.route.param('id');
  this.vm = {
    connectedWS: true // is connected to websocket
  };
  this.round = null;
  this.gameSocket = null;
  this.lobbySocket = null;

  this.chessground = new Chessground.controller({
    viewOnly: true
  });

  var onConnected = function () {
    var wasOff = !this.vm.connectedWS;
    this.vm.connectedWS = true;
    if (wasOff) m.redraw();
  }.bind(this);

  var onDisconnected = function () {
    var wasOn = this.vm.connectedWS;
    this.vm.connectedWS = false;
    if (wasOn) setTimeout(function () { m.redraw(); }, 1000);
  }.bind(this);

  var onPause = function() {
    if (this.gameSocket) this.gameSocket.destroy();
  }.bind(this);

  var onResume = function() {
    if (this.gameSocket) this.gameSocket.connect();
  }.bind(this);

  var resumeGame = function(id) {
    var self = this;
    xhr.game(id).then(function(data) {
      self.gameSocket = makeGameSocket(self, data);
      self.round = makeRound(self, data);
      if (window.cordova) window.plugins.insomnia.keepAwake();
    }, function(error) {
      utils.handleXhrError(error);
      m.route('/');
    });
  }.bind(this);

  resumeGame(this.id);

  this.onunload = function() {
    if (this.round) {
      this.round.onunload();
      this.round = null;
    }
    if (this.gameSocket) {
      this.gameSocket.destroy();
      this.gameSocket = null;
    }
    if (this.lobbySocket) {
      this.lobbySocket.destroy();
      this.lobbySocket = null;
    }
    signals.connected.remove(onConnected);
    signals.disconnected.remove(onDisconnected);
    document.removeEventListener('pause', onPause, false);
    document.removeEventListener('resume', onResume, false);
    if (window.cordova) window.plugins.insomnia.allowSleepAgain();
  };

  signals.connected.add(onConnected);
  signals.disconnected.add(onDisconnected);
  document.addEventListener('pause', onPause, false);
  document.addEventListener('resume', onResume, false);
};