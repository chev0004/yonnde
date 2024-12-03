import path from 'path';
import kuromoji from 'kuromoji';
import readline from 'readline';
import { promises as fs } from 'fs';

import { IpadicFeatures, Tokenizer } from 'kuromoji';

interface NestedContent {
	content: string | NestedContent | NestedContent[];
}
type DictionaryMap = Map<string, DictionaryEntry[]>;
type DictionaryContent = string | NestedContent | NestedContent[];
type DictionaryEntry = [
	string,
	string,
	string,
	string,
	string,
	DictionaryContent
];
const collectionsDir = 'dictionaries/';

//IO
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

//get all collections and combine them into a single map
const loadDictionaries = async (): Promise<DictionaryMap> => {
	try {
		const collections = await fs.readdir(collectionsDir);
		let dictionaryMap: DictionaryMap = new Map();
		//loop through collections
		for (const collection of collections) {
			const collectionPath = path.join(collectionsDir, collection);
			const stats = await fs.stat(collectionPath);
			//if collection is a directory, load its files
			if (stats.isDirectory()) {
				const files = await fs.readdir(collectionPath);
				let termBank: DictionaryEntry[] = [];
				//discrimination
				const jsonFiles = files.filter(
					(file: string) => path.extname(file) === '.json'
				);
				//read files and combine them into a single array
				const readPromises = jsonFiles.map(async (file: string) => {
					const filePath = path.join(collectionPath, file);
					const data = await fs.readFile(filePath, 'utf-8');
					const obj: DictionaryEntry[] = JSON.parse(data);
					termBank = termBank.concat(obj);
				});
				//wait for all files to be read
				await Promise.all(readPromises);
				//then add to map
				dictionaryMap.set(collection, termBank);
			}
		}
		//final
		return dictionaryMap;
	} catch (err) {
		console.error('Error loading dictionaries:', err);
		throw err;
	}
};
//loggening
const logContent = (data: DictionaryContent, indent: string = ''): void => {
	//handle array at top level
	if (Array.isArray(data)) {
		data.forEach((item: DictionaryContent) => {
			if (typeof item === 'string') {
				//split string by newlines and display each line
				item.split('\n')
					.filter((line) => line.trim())
					.forEach((line) => {
						console.log(`${indent} ${line.trim()}`);
					});
			} else if (typeof item === 'object' && item !== null) {
				logContent(item, indent);
			}
		});
		return;
	}

	//if birdnest (very nested format)
	if (typeof data === 'object' && data !== null) {
		if (data.content) {
			//if content is string, log it directly
			if (typeof data.content === 'string') {
				console.log(`${indent} ${data.content.trim()}`);
				//if content is nested, process it recursively
			} else {
				logContent(data.content, `${indent}  `);
			}
		}
		return;
	}

	//if string, log it directly
	if (typeof data === 'string') {
		data.split('\n')
			.filter((line) => line.trim())
			.forEach((line) => {
				console.log(`${indent} ${line.trim()}`);
			});
	}
};

const main = async (): Promise<void> => {
	try {
		const dictionaryMap = await loadDictionaries();
		let foundResults = false;
		//eternal loop (prompt)
		const processQuery = () => {
			rl.question(
				'Enter search term (or "exit" to quit): ',
				async (searchTerm: string) => {
					//exit commands
					if (
						['exit', 'quit', 'q'].includes(searchTerm.toLowerCase())
					) {
						rl.close();
						return;
					}

					//store the basic form of a search term if not found in initial search
					let basicForm: string | null = null;

					//iterate through all dictionary collections and term banks
					for (const [collectionName, termBank] of Array.from(
						dictionaryMap
					)) {
						//search for exact matches of the search term in either column 0 or 1 (kanji or kana)
						const results = termBank.filter(
							(entry: DictionaryEntry) =>
								(typeof entry[0] === 'string' &&
									entry[0] === searchTerm) ||
								(typeof entry[1] === 'string' &&
									entry[1] === searchTerm)
						);
						if (results.length > 0) {
							//display if exact match is found
							console.log(
								`\n=== Results from ${collectionName} ===`
							);
							//process and display each matching result
							results.forEach((result: DictionaryEntry) => {
								const birdnest = result[5];
								logContent(birdnest);
								console.log('---');
							});
							foundResults = true;
						} else {
							//if no exact matches, try searching with the basic form of the word
							if (!basicForm) {
								basicForm = (await getBasicForm(
									searchTerm
								)) as string;
							}
							//search for matches using the basic form in either column 0 or 1 (kanji or kana)
							const basicFormResults = termBank.filter(
								(entry: DictionaryEntry) =>
									(typeof entry[0] === 'string' &&
										entry[0] === basicForm) ||
									(typeof entry[1] === 'string' &&
										entry[1] === basicForm)
							);
							//display if found
							if (basicFormResults.length > 0) {
								console.log(
									`\n=== Results from ${collectionName} ===`
								);
								basicFormResults.forEach(
									(result: DictionaryEntry) => {
										const birdnest = result[5];
										logContent(birdnest);
										console.log('---');
									}
								);
							}
						}
					}
					processQuery();
				}
			);
		};
		//beginning of eternal loop
		processQuery();
	} catch (err) {
		console.error('Error:', err);
		rl.close();
	}
};

main();

//kuromoji promise (for parsing)
const getBasicForm = (searchTerm: string): Promise<string> => {
	return new Promise((resolve, reject) => {
		kuromoji
			.builder({ dicPath: 'node_modules/kuromoji/dict' })
			.build(
				(err: Error | null, tokenizer: Tokenizer<IpadicFeatures>) => {
					if (err) reject(err);
					const tokens = tokenizer.tokenize(searchTerm);
					resolve(tokens[0].basic_form);
				}
			);
	});
};
