'use babel';

var osc = require('node-osc')

export default class OSC {

    client: null
    evalData: ''
    subscription: null
    cusors: null
    editor: null


    constructor(host, port) {
        this.client = new osc.Client(host, port);
        console.log("sending editor contents to " + host + ":" + port)

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
        this.subscription = this.editor.onDidChangeCursorPosition((e) => {
            var end = Math.min(this.editor.getLineCount(), e.newBufferPosition.row + 5) + 1;
            var begin = Math.max(0, end - 11);
            end = begin + 11;
            var range = [
              [begin, 0],
              [end, 0]
            ];
            this._send('/change', [
              this.editor.getLineCount(),
              this.editor.getTextInBufferRange(range)
                .replace('\t', '__p')
            ]);
        });
    }

    destroy() {
        if (this.subscription) {
          this.subscription.dispose();
        }
        if (this.client) {
            this.client.kill();
        }
    }
}
