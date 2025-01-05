import path from 'path';
import { promises as fs } from 'fs';
import kuromoji from 'kuromoji';
import readline from 'readline';

type DictionaryContent = {
	content?: string | DictionaryContent | DictionaryContent[];
};

type RawDictionaryEntry = [
	string, // term
	string, // reading
	string, // tags string
	string, // rules
	number, // score
	DictionaryContent | DictionaryContent[], // definitions
	number, // sequence
	string // termTags
];

type KuromojiToken = {
	basic_form: string;
	pos: string;
	pos_detail_1: string;
	pos_detail_2: string;
	pos_detail_3: string;
	conjugated_type: string;
	conjugated_form: string;
	reading: string;
	pronunciation: string;
	surface_form: string;
};

type KuromojiTokenizer = {
	tokenize(text: string): KuromojiToken[];
};

type DictionaryEntry = {
	term: string;
	reading: string;
	tags: string[];
	rules: string;
	score: number;
	definitions: string[];
	sequence: number;
	termTags: string;
};

class DictionarySearcher {
	private _termDictionaries: Map<string, DictionaryEntry[]>;
	private _readingIndex: Map<string, DictionaryEntry[]>;
	private _isReady: boolean;

	constructor() {
		this._termDictionaries = new Map();
		this._readingIndex = new Map();
		this._isReady = false;
	}

	async loadDictionaries(collectionsDir: string): Promise<void> {
		try {
			const collections = await fs.readdir(collectionsDir);

			for (const collection of collections) {
				const collectionPath = path.join(collectionsDir, collection);
				const stats = await fs.stat(collectionPath);

				if (stats.isDirectory()) {
					const files = await fs.readdir(collectionPath);
					const jsonFiles = files.filter(
						(file) => path.extname(file) === '.json'
					);

					for (const file of jsonFiles) {
						const filePath = path.join(collectionPath, file);
						const data = await fs.readFile(filePath, 'utf-8');
						let entries: RawDictionaryEntry[];
						try {
							const parsed = JSON.parse(data);
							entries = Array.isArray(parsed) ? parsed : [parsed];
						} catch (error) {
							console.error(
								`Error parsing JSON file ${filePath}:`,
								error
							);
							continue;
						}

						for (const entry of entries) {
							const formattedEntry = this._formatEntry(entry);

							if (
								!this._termDictionaries.has(formattedEntry.term)
							) {
								this._termDictionaries.set(
									formattedEntry.term,
									[]
								);
							}
							this._termDictionaries
								.get(formattedEntry.term)
								?.push(formattedEntry);

							if (
								!this._readingIndex.has(formattedEntry.reading)
							) {
								this._readingIndex.set(
									formattedEntry.reading,
									[]
								);
							}
							this._readingIndex
								.get(formattedEntry.reading)
								?.push(formattedEntry);
						}
					}
				}
			}
			this._isReady = true;
		} catch (error) {
			console.error('Error loading dictionaries:', error);
			throw error;
		}
	}

	findTerm(searchTerm: string): DictionaryEntry[] {
		if (!this._isReady) {
			throw new Error('Dictionaries not loaded');
		}

		const termResults = this._termDictionaries.get(searchTerm) || [];
		const readingResults = this._readingIndex.get(searchTerm) || [];

		return [...new Set([...termResults, ...readingResults])];
	}

	private _formatEntry(rawEntry: RawDictionaryEntry): DictionaryEntry {
		const formatDefinition = (def: DictionaryContent | string): string => {
			if (typeof def === 'string') {
				return def;
			}
			if (typeof def === 'object' && def !== null) {
				if (def.content) {
					if (Array.isArray(def.content)) {
						return def.content.map(formatDefinition).join('; ');
					}
					return formatDefinition(def.content);
				}
				return JSON.stringify(def);
			}
			return String(def);
		};

		const definitions = Array.isArray(rawEntry[5])
			? rawEntry[5].map(formatDefinition)
			: [formatDefinition(rawEntry[5])];

		return {
			term: rawEntry[0],
			reading: rawEntry[1],
			tags: (rawEntry[2] || '').split(' ').filter((t: string) => t),
			rules: rawEntry[3] || '',
			score: rawEntry[4] || 0,
			definitions: definitions,
			sequence: rawEntry[6] || 0,
			termTags: rawEntry[7] || '',
		};
	}
}

class DictionaryApp {
	private searcher: DictionarySearcher;
	private rl: readline.Interface;
	private tokenizer!: KuromojiTokenizer;

	constructor() {
		this.searcher = new DictionarySearcher();
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
	}

	async initialize(): Promise<void> {
		await this.searcher.loadDictionaries('dictionaries/');
		this.tokenizer = await this.initializeTokenizer();
	}

	private async initializeTokenizer(): Promise<KuromojiTokenizer> {
		return new Promise((resolve, reject) => {
			kuromoji
				.builder({ dicPath: 'node_modules/kuromoji/dict' })
				.build(
					(
						err: Error,
						tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures>
					) => {
						if (err) reject(err);
						resolve(tokenizer as KuromojiTokenizer);
					}
				);
		});
	}

	async getBasicForm(searchTerm: string): Promise<string> {
		const tokens = this.tokenizer.tokenize(searchTerm);
		return tokens.length === 0 ? searchTerm : tokens[0].basic_form;
	}

	private displayResults(results: DictionaryEntry[]): void {
		if (results.length === 0) {
			console.log('No results found.');
			return;
		}

		results.forEach((entry) => {
			console.log('\n=== Result ===');
			console.log(`Term: ${entry.term}`);
			console.log(`Reading: ${entry.reading}`);
			console.log('Definitions:');
			entry.definitions.forEach((def) => {
				console.log(`  - ${def}`);
			});
			if (entry.tags.length > 0) {
				console.log(`Tags: ${entry.tags.join(', ')}`);
			}
			console.log('---');
		});
	}

	private displayStructuredDefinition(
		def: DictionaryContent,
		indent: string = '  '
	): void {
		if (typeof def.content === 'string') {
			console.log(`${indent}- ${def.content}`);
		} else if (Array.isArray(def.content)) {
			def.content.forEach((item: DictionaryContent) => {
				this.displayStructuredDefinition(item, indent + '  ');
			});
		} else if (def.content) {
			this.displayStructuredDefinition(def.content, indent);
		}
	}

	async start(): Promise<void> {
		const processQuery = async () => {
			this.rl.question(
				'Enter search term (or "exit" to quit): ',
				async (searchTerm: string) => {
					if (
						['exit', 'quit', 'q'].includes(searchTerm.toLowerCase())
					) {
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
				}
			);
		};

		await processQuery();
	}
}

const app = new DictionaryApp();
app.initialize()
	.then(() => app.start())
	.catch((error) => console.error('Error:', error));
