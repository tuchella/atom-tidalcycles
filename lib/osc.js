'use babel';

var osc = require('node-osc')
import APM from 'apm'

export default class OSC {

    client: null
    evalData: ''
    subscription: null
    cusors: null
    editor: null
    apm: null


    constructor(host, port) {
        this.client = new osc.Client(host, port);
        console.log("sending editor contents to " + host + ":" + port)

        this.apm = new APM({
            accuracy: 1,
            timeSpan: 60,
            data: []
        });

        atom.commands.add('atom-text-editor', {
            'tidalcycles:observe-editor': () => this.observeEditor()
        });
    }

    _send(address, data) {
        this.client.send(address, data,  function (err) {
            if (err) {
              console.error(new Error(err));
            }
            if (this.client) {
                this.client.kill();
            }
        });
    }

    send(data) {
        if(data == '\n') {
            this._send('/eval', this.evalData);
            this.evalData = '';
        } else {
            this.evalData += data;
        }
    }

    sendStderr(t) {
        this._send('/stderr', t)
    }

    sendStdout(t) {
        this._send('/stdout', t)
    }

    observeEditor() {
        if (this.subscription) {
            this.subscription.dispose();
        }
        this.editor = atom.workspace.getActiveTextEditor();
        this.subscriptions = [
          this.editor.onDidChangeCursorPosition((e) => {
            this.sendText(e.newBufferPosition);
          }),
          this.editor.onDidStopChanging((e) => {
            console.log(e);
            this.sendText(this.editor.getCursorBufferPosition());
          }),
        ];
    }

    sendText(pos) {
      this.apm.action('key', 1);
      this._send('/apm', ['key', this.apm.get('key')])

      var end = Math.min(this.editor.getLineCount(), pos.row + 5) + 1;
      var begin = Math.max(0, end - 12);
      end = begin + 12
      var range = [
        [begin, 0],
        [end, 0]
      ];

      this._send('/change', [
        this.editor.getLineCount(),
        this.editor.getTextInBufferRange(range)
          .replace('\t', '  ')
          .split('\n').map((l, i) => (begin + i + 1).toString().padStart(3, ' ') + ' ' + l)
          .join('\n'),
        pos.row - begin,
        pos.column
      ]);
    }

    destroy() {
        if (this.subscription) {
          this.subscription.forEach(s => s.dispose());
        }
        if (this.client) {
            this.client.kill();
        }
    }
}
