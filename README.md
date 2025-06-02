# PDF to Gherkin Converter with Jira Integration

A desktop application that converts PDF requirements documents to Gherkin feature files using ChatGPT and can push them to Jira as Epics and Stories.

## Features

- Select any PDF file containing requirements
- Extract text content from the PDF
- Use ChatGPT to convert the requirements into Gherkin format feature files
- Save the generated feature files to your local system
- Push to Jira with Features as Epics and Given statements as Stories
- Link created issues to a parent issue in Jira

## Requirements

- OpenAI API key (for ChatGPT integration)

## Installation

### From Source

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Run the application:
   ```
   npm start
   ```

### Packaged Application

Download the latest release for your platform from the releases page.

## Usage

1. Launch the application
2. Click "Select PDF" to choose a PDF file containing requirements
3. Enter your OpenAI API key
4. Click "Process PDF" to convert the requirements to Gherkin format
5. Review the generated Gherkin content
6. Click "Save Feature Files" to save the feature files to your local system

### Jira Integration

7. Click "Push to Jira" to open the Jira integration panel
8. Enter your Jira instance details:
   - Jira URL (e.g., https://your-domain.atlassian.net)
   - Username/Email
   - API Token (create one in your Atlassian account settings)
   - Your credentials can be saved locally for future use
9. Click "Test Connection" to verify your Jira credentials
10. Click "Load Jira Data" to fetch projects, issue types, and custom fields
11. Select a project to automatically load:
    - Project-specific issue types
    - Available Initiatives in the project
    - Custom fields specific to each issue type
12. Select from the populated dropdowns:
    - Epic Issue Type (defaults to Epic)
    - Story Issue Type (defaults to Story)
    - Parent Initiative (optional)
    - Epic Name Field (automatically detected for the selected issue type)
    - Epic Link Field (automatically detected for the selected issue type)
13. Click "Create in Jira" to create Epics and Stories:
    - Each Feature becomes an Epic
    - Each Given statement becomes a Story linked to its parent Epic
    - All created issues are linked to the specified parent Initiative (if provided)

### Credential Management

- Click "Save Credentials" to securely store your Jira credentials locally
- Click "Clear Credentials" to remove saved credentials
- Credentials are automatically loaded when you open the Jira integration panel

## Building from Source

To build the application for your platform:

```
npm run build
```

The packaged application will be available in the `dist` directory.

## Technologies Used

- Electron
- Node.js
- OpenAI API (ChatGPT)
- pdf-parse (for PDF text extraction)
- jira-client (for Jira API integration)
- gherkin-parse (for parsing Gherkin syntax)

## License

ISC
