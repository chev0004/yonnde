const path = require('path');
const fs = require('fs').promises;
const readline = require('readline');
const kuromoji = require('kuromoji');

const collectionsDir = '/home/chev/Documents/code stuff/yonnde/dictionaries/';

//IO
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

//get all collections and combine them into a single map
const loadDictionaries = async () => {
	try {
		const collections = await fs.readdir(collectionsDir);
		let dictionaryMap = new Map();
		//loop through collections
		for (const collection of collections) {
			const collectionPath = path.join(collectionsDir, collection);
			const stats = await fs.stat(collectionPath);
			//if collection is a directory, load its files
			if (stats.isDirectory()) {
				const files = await fs.readdir(collectionPath);
				let termBank = [];
				//discrimination
				const jsonFiles = files.filter(
					(file) => path.extname(file) === '.json'
				);
				//read files and combine them into a single array
				const readPromises = jsonFiles.map(async (file) => {
					const filePath = path.join(collectionPath, file);
					const data = await fs.readFile(filePath, 'utf-8');
					const obj = JSON.parse(data);
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
const logContent = (data, indent = '') => {
	//handle array at top level
	if (Array.isArray(data)) {
		data.forEach((item) => {
			if (typeof item === 'string') {
				//split string by newlines and display each line
				item.split('\n')
					.filter((line) => line.trim())
					.forEach((line) => {
						console.log(`${indent} ${line.trim()}`);
					});
			} else {
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

const main = async () => {
	try {
		const dictionaryMap = await loadDictionaries();
		//eternal loop (prompt)
		const processQuery = () => {
			rl.question(
				'Enter search term (or "exit" to quit): ',
				async (searchTerm) => {
					//exit commands
					if (
						['exit', 'quit', 'q'].includes(searchTerm.toLowerCase())
					) {
						rl.close();
						return;
					}

					//store the basic form of a search term if not found in initial search
					let basicForm = null;

					//iterate through all dictionary collections and term banks
					for (const [collectionName, termBank] of dictionaryMap) {
						//search for exact matches of the search term in either column 0 or 1 (kanji or kana)
						const results = termBank.filter(
							(entry) =>
								entry[0] === searchTerm ||
								entry[1] === searchTerm
						);
						if (results.length > 0) {
							//display if exact match is found
							console.log(
								`\n=== Results from ${collectionName} ===`
							);
							//process and display each matching result
							results.forEach((result) => {
								const birdnest = result[5];
								logContent(birdnest);
								console.log('---');
							});
							foundResults = true;
						} else {
							//if no exact matches, try searching with the basic form of the word
							if (!basicForm) {
								basicForm = await getBasicForm(searchTerm);
							}
							//search for matches using the basic form in either column 0 or 1 (kanji or kana)
							const basicFormResults = termBank.filter(
								(entry) =>
									entry[0] === basicForm ||
									entry[1] === basicForm
							);
							//display if found
							if (basicFormResults.length > 0) {
								console.log(
									`\n=== Results from ${collectionName} ===`
								);
								basicFormResults.forEach((result) => {
									const birdnest = result[5];
									logContent(birdnest);
									console.log('---');
								});
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
const getBasicForm = (searchTerm) => {
	return new Promise((resolve, reject) => {
		kuromoji
			.builder({ dicPath: 'node_modules/kuromoji/dict' })
			.build((err, tokenizer) => {
				if (err) reject(err);
				const tokens = tokenizer.tokenize(searchTerm);
				resolve(tokens[0].basic_form);
			});
	});
};
