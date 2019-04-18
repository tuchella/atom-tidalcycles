'use babel';

import ConsoleView from './console-view';
import Repl from './repl';
import Osc from './osc';

export default {
    consoleView: null,
    tidalRepl: null,
    osc: null,
    config: {
        'ghciPath': {
            type: 'string',
            default: 'ghci'
        },
        'bootTidalPath': {
            type: 'string',
            default: ''
        },
        'useBootFileInCurrentDirectory': {
            type: 'boolean',
            default: false,
            description: 'If a BootTidal.hs file is found at the root of your Atom project, it will be used to boot Tidal.'
        },
        'onlyShowLogWhenErrors': {
            type: 'boolean',
            default: false,
            description: 'Only show console if last message was an error.'
        },
        'onlyLogLastMessage': {
            type: 'boolean',
            default: false,
            description: 'Only log last message to the console.'
        },
        'filterPromptFromLogMessages': {
            type: 'boolean',
            default: true,
            description: 'Whether to filter out those long prompt comming from ghci.'
        },
        'consoleMaxHeight': {
            type: 'integer',
            default: 100,
            description: 'The console maximum height in pixels.'
        }
    },

    activate(state) {
        this.consoleView = new ConsoleView(state.consoleViewState);
        this.osc = new Osc('127.0.0.1',5677);
        this.tidalRepl = new Repl(this.consoleView,this.osc);
    },

    deactivate() {
        this.consoleView.destroy();
        this.tidalRepl.destroy();
        this.osc.destroy();
    },

    serialize() {
        return {
            consoleViewState: this.consoleView.serialize()
        };
    }

};
