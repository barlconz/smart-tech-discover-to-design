# Feature Files to Jira Integration

A desktop application that parses Gherkin feature files and pushes them to Jira in a hierarchical structure.

## Features

- Select a folder containing Gherkin feature files
- Parse the feature files
- Save the feature files to your local system
- Push to Jira with a hierarchical structure: Initiative (Level 3) > Epic (Level 2) > Feature (Level 1) > Story (Level 0)
- Each Feature file becomes a Feature in Jira with the content in a Gherkin code snippet
- Each Scenario becomes a Story in Jira with the content in a Gherkin code snippet

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
2. Click "Select Folder" to choose a folder containing feature files
3. Click "Process Feature Files" to parse the feature files
4. Review the parsed Gherkin content
5. Click "Save Feature Files" to save the feature files to your local system

### Jira Integration

6. Click "Push to Jira" to open the Jira integration panel
7. Enter your Jira instance details:
   - Jira URL (e.g., https://your-domain.atlassian.net)
   - Username/Email
   - API Token (create one in your Atlassian account settings)
   - Your credentials can be saved locally for future use
8. Click "Test Connection" to verify your Jira credentials
9. Click "Load Jira Data" to fetch projects, issue types, and custom fields
10. Select a project to automatically load:
    - Project-specific issue types
    - Available Epics in the project
    - Custom fields specific to each issue type
11. Select a parent Initiative (Level 3) from the dropdown
12. Click "Create in Jira" to create the hierarchy:
    - An Epic (Level 2) is created under the selected Initiative
    - Each Feature file becomes a Feature (Level 1) in Jira linked to the Epic
    - Each Scenario becomes a Story (Level 0) linked to its parent Feature
    - All content is formatted in proper Gherkin style with Given/When/Then steps in code snippets

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
- Jira API (via jira-client)
- gherkin-parse (for parsing Gherkin syntax)

## License

ISC
