# YONNDE

A command-line Japanese dictionary lookup tool that searches through Yomichan dictionaries.

## Features

-   Uses Yomichan dictionaries
-   Basic form detection using kuromoji

## Setup

1. Install dependencies:

npm install

2. Set up dictionaries:
    - Create a /dictionaries directory in the project root
    - Inside /dictionaries, add your yomichan dictionaries
    - Dictionary files should be according to: https://github.com/yomidevs/yomitan/blob/master/docs/making-yomitan-dictionaries.md

## Usage

1. Start the application:

node index.js

2. Enter search terms at the prompt
3. Type exit, quit, or q to close the application

## License

MIT License - See LICENSE file for details

## Dependencies

-   kuromoji: Japanese morphological analyzer
-   Node.js runtime

Note: Dictionary files are not included in the repository and must be set up separately.
