import path from 'path';
import { promises as fs } from 'fs';
import kuromoji from 'kuromoji';
import readline from 'readline';
class DictionarySearcher {
    _termDictionaries;
    _readingIndex;
    _isReady;
    constructor() {
        this._termDictionaries = new Map();
        this._readingIndex = new Map();
        this._isReady = false;
    }
    async loadDictionaries(collectionsDir) {
        try {
            const collections = await fs.readdir(collectionsDir);
            for (const collection of collections) {
                const collectionPath = path.join(collectionsDir, collection);
                const stats = await fs.stat(collectionPath);
                if (stats.isDirectory()) {
                    const files = await fs.readdir(collectionPath);
                    const jsonFiles = files.filter((file) => path.extname(file) === '.json');
                    for (const file of jsonFiles) {
                        const filePath = path.join(collectionPath, file);
                        const data = await fs.readFile(filePath, 'utf-8');
                        const entries = JSON.parse(data);
                        for (const entry of entries) {
                            const formattedEntry = this._formatEntry(entry);
                            // Index by term
                            if (!this._termDictionaries.has(formattedEntry.term)) {
                                this._termDictionaries.set(formattedEntry.term, []);
                            }
                            this._termDictionaries
                                .get(formattedEntry.term)
                                ?.push(formattedEntry);
                            // Index by reading
                            if (!this._readingIndex.has(formattedEntry.reading)) {
                                this._readingIndex.set(formattedEntry.reading, []);
                            }
                            this._readingIndex
                                .get(formattedEntry.reading)
                                ?.push(formattedEntry);
                        }
                    }
                }
            }
            this._isReady = true;
        }
        catch (error) {
            console.error('Error loading dictionaries:', error);
            throw error;
        }
    }
    findTerm(searchTerm) {
        if (!this._isReady) {
            throw new Error('Dictionaries not loaded');
        }
        const termResults = this._termDictionaries.get(searchTerm) || [];
        const readingResults = this._readingIndex.get(searchTerm) || [];
        return [...new Set([...termResults, ...readingResults])];
    }
    _formatEntry(rawEntry) {
        return {
            term: rawEntry[0],
            reading: rawEntry[1],
            tags: (rawEntry[2] || '').split(' ').filter((t) => t),
            rules: rawEntry[3] || '',
            score: rawEntry[4] || 0,
            definitions: Array.isArray(rawEntry[5])
                ? rawEntry[5]
                : [rawEntry[5]],
            sequence: rawEntry[6] || 0,
            termTags: rawEntry[7] || '',
        };
    }
}
// Main application class
class DictionaryApp {
    searcher;
    rl;
    tokenizer;
    constructor() {
        this.searcher = new DictionarySearcher();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }
    async initialize() {
        await this.searcher.loadDictionaries('dictionaries/');
        this.tokenizer = await this.initializeTokenizer();
    }
    async initializeTokenizer() {
        return new Promise((resolve, reject) => {
            kuromoji
                .builder({ dicPath: 'node_modules/kuromoji/dict' })
                .build((err, tokenizer) => {
                if (err)
                    reject(err);
                resolve(tokenizer);
            });
        });
    }
    async getBasicForm(searchTerm) {
        const tokens = this.tokenizer.tokenize(searchTerm);
        return tokens[0].basic_form;
    }
    displayResults(results) {
        if (results.length === 0) {
            console.log('No results found.');
            return;
        }
        results.forEach((entry) => {
            console.log('\n=== Result ===');
            console.log(`Term: ${entry.term}`);
            console.log(`Reading: ${entry.reading}`);
            console.log('Definitions:');
            entry.definitions.forEach((def) => console.log(`  - ${def}`));
            if (entry.tags.length > 0) {
                console.log(`Tags: ${entry.tags.join(', ')}`);
            }
            console.log('---');
        });
    }
    async start() {
        const processQuery = async () => {
            this.rl.question('Enter search term (or "exit" to quit): ', async (searchTerm) => {
                if (['exit', 'quit', 'q'].includes(searchTerm.toLowerCase())) {
                    this.rl.close();
                    return;
                }
                let results = this.searcher.findTerm(searchTerm);
                if (results.length === 0) {
                    const basicForm = await this.getBasicForm(searchTerm);
                    if (basicForm !== searchTerm) {
                        results = this.searcher.findTerm(basicForm);
                    }
                }
                this.displayResults(results);
                processQuery();
            });
        };
        await processQuery();
    }
}
// Run the application
const app = new DictionaryApp();
app.initialize()
    .then(() => app.start())
    .catch((error) => console.error('Error:', error));
