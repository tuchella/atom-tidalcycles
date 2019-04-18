'use babel';

var fs = require('fs');
var spawn = require('child_process').spawn;
var Range = require('atom').range;
var defaultBootFileName = 'BootTidal.hs';
var defaultBootFilePath = __dirname + '/' + defaultBootFileName;
var CONST_LINE = 'line'
var CONST_MULTI_LINE = 'multi_line'

export default class REPL {

    repl: null
    consoleView: null
    osc: null
    stdErr: null
    stdOut: null
    stdTimer:0

    constructor(consoleView, osc) {
        this.consoleView = consoleView;
        this.osc = osc;
        this.stdErr = []
        this.stdOut = []

        atom.commands.add('atom-workspace', {
            'tidalcycles:boot': () => {
                if (this.editorIsTidal()) {
                    this.start();
                    return;
                }
                console.error('Not a .tidal file.');
            }
        });

        atom.commands.add('atom-text-editor', {
            'tidalcycles:eval': () => this.eval(CONST_LINE, false),
            'tidalcycles:eval-multi-line': () => this.eval(CONST_MULTI_LINE, false),
            'tidalcycles:eval-copy': () => this.eval(CONST_LINE, true),
            'tidalcycles:eval-multi-line-copy': () => this.eval(CONST_MULTI_LINE, true),
            'tidalcycles:hush': () => this.hush()
        });

    }

    editorIsTidal() {
        var editor = this.getEditor();
        if (!editor) return false;
        return editor.getGrammar().scopeName === 'source.tidalcycles';
    }

    hush() {
        this.tidalSendExpression('hush');
    }

    doSpawn() {
        this.repl = spawn(this.getGhciPath(), [], {
            shell: true
        });
        this.repl.stderr.on('data', (data) => {
          this.processStdErr(data);
        });
        this.repl.stdout.on('data', (data) => {
          this.processStdOut(data);
        });
    }

    processStdOut(data){
      this.stdOut.push(data.toString('utf8'))
      this.processStd()
    }

    processStdErr(data){
      this.stdErr.push(data.toString('utf8'))
      this.processStd()
    }

    processStd(){
      clearTimeout(this.stdTimer)
      // defers the handler of stdOut/stdErr data
      // by some arbitrary ammount of time (50ms)
      // to get the buffer filled completly
      this.stdTimer = setTimeout(()=>this.flushStd(),50);
    }

    flushStd(){

      if(this.stdErr.length){
        let t = this.stdErr.join('')
        if(atom.config.get('tidalcycles.filterPromptFromLogMessages')){
          t = t.replace(/<interactive>.*error:/g,"")
          t = t.replace(/ \(bound at.*/g,"")
        }
        this.consoleView.logStderr(t);
        this.osc.sendStderr(t);
        this.stdErr.length = 0
        //dont care about stdOut if there are errors
        this.stdOut.length = 0

      }

      if(this.stdOut.length){
        let t = this.stdOut.join('')
        if(atom.config.get('tidalcycles.filterPromptFromLogMessages')){
          t = t.replace(/tidal>.*Prelude>/g,"")
          t = t.replace(/tidal>/g,"")
          t = t.replace(/Prelude>/g,"")
          t = t.replace(/Prelude.*\|/g,"")
          t = t.replace(/GHCi.*help/g,"")
          t = "t>"+t+"\n"
        }
        this.consoleView.logStdout(t);
        this.osc.sendStdout(t);
        this.stdOut.length = 0
      }


    }

    getGhciPath() {
        return atom.config.get('tidalcycles.ghciPath');
    }

    getBootTidalPath() {

        const useCurrentDirectory = atom.config.get('tidalcycles.useBootFileInCurrentDirectory');
        const rootDirectories = atom.project.rootDirectories;
        const currentDirectoryPath = rootDirectories.length > 0 ?
            rootDirectories[0].path + '/' + defaultBootFileName :
            null;

        if (fs.existsSync(currentDirectoryPath)) return currentDirectoryPath;

        const configuredBootFilePath = atom.config.get('tidalcycles.bootTidalPath');
        const actualBootPath = configuredBootFilePath !== '' ? configuredBootFilePath : defaultBootFilePath;
        return actualBootPath;
    }

    initTidal() {
        const bootPath = this.getBootTidalPath();
        var commands = fs.readFileSync(bootPath).toString().split('\n');
        for (var i = 0; i < commands.length; i++) {
            this.tidalSendLine(commands[i]);
        }
    }

    stdinWrite(command) {
        this.repl.stdin.write(command);
        this.osc.send(command);
    }

    tidalSendLine(command) {
        this.stdinWrite(command);
        this.stdinWrite('\n');
    }

    tidalSendExpression(expression) {
        this.tidalSendLine(':{');
        var splits = expression.split('\n');
        for (var i = 0; i < splits.length; i++) {
            this.tidalSendLine(splits[i]);
        }
        this.tidalSendLine(':}');
    }

    start() {
        this.consoleView.initUI();
        this.doSpawn();
        this.initTidal();
    }
    getEditor() {
        var editor = atom.workspace.getActiveTextEditor();
        return editor;
    }

    eval(evalType, copy) {
        if (!this.editorIsTidal()) return;

        if (!this.repl) this.start();

        var expressionAndRange = this.currentExpression(evalType);
        var expression = expressionAndRange[0];
        var range = expressionAndRange[1];
        this.evalWithRepl(expression, range, copy);
    }

    evalWithRepl(expression, range, copy) {
        var self = this;
        if (!expression) return;

        function doIt() {
            var unflash;
            if (range) {
                unflash = self.evalFlash(range);
                var copyRange;
                if (copy) {
                    copyRange = self.copyRange(range);
                }
            }

            function onSuccess() {
                if (unflash) {
                    unflash('eval-success');
                }
            }

            self.tidalSendExpression(expression);
            onSuccess();
        }

        doIt();
    }

    destroy() {
        if (this.repl) {
            this.repl.kill();
        }
    }

    currentExpression(evalType) {
        var editor = this.getEditor();
        if (!editor) return;

        var selection = editor.getLastSelection();
        var expression = selection.getText();

        if (expression) {
            var range = selection.getBufferRange();
            return [expression, range];
        } else {
            if (evalType === CONST_LINE) {
                return this.getLineExpression(editor);
            }
            return this.getMultiLineExpression(editor);
        }
    }

    copyRange(range) {
        var editor = this.getEditor();
        var endRow = range.end.row;
        endRow++
        var text = editor.getTextInBufferRange(range);
        text = '\n' + text + '\n';

        if (endRow > editor.getLastBufferRow()) {
            text = '\n' + text
        }

        editor.getBuffer().insert([endRow, 0], text);
    }

    getLineExpression(editor) {
        var cursor = editor.getCursors()[0];
        var range = cursor.getCurrentLineBufferRange();
        var expression = range && editor.getTextInBufferRange(range);
        return [expression, range];
    }

    getMultiLineExpression(editor) {
        var range = this.getCurrentParagraphIncludingComments(editor);
        var expression = editor.getTextInBufferRange(range);
        return [expression, range];
    }

    getCurrentParagraphIncludingComments(editor) {
        var cursor = editor.getLastCursor();
        var startRow = endRow = cursor.getBufferRow();
        var lineCount = editor.getLineCount();

        // lines must include non-whitespace characters
        // and not be outside editor bounds
        while (/\S/.test(editor.lineTextForBufferRow(startRow)) && startRow >= 0) {
            startRow--;
        }
        while (/\S/.test(editor.lineTextForBufferRow(endRow)) && endRow < lineCount) {
            endRow++;
        }
        return {
            start: {
                row: startRow + 1,
                column: 0
            },
            end: {
                row: endRow,
                column: 0
            },
        };
    }

    evalFlash(range) {
        var editor = this.getEditor();
        var marker = editor.markBufferRange(range, {
            invalidate: 'touch'
        });

        var decoration = editor.decorateMarker(
            marker, {
                type: 'line',
                class: 'eval-flash'
            });

        // return fn to flash error / success and destroy the flash
        return function (cssClass) {
            decoration.setProperties({
                type: 'line',
                class: cssClass
            });
            var destroy = function () {
                marker.destroy();
            };
            setTimeout(destroy, 120);
        };
    }
}
