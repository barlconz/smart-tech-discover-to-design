const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const JiraClient = require('jira-client');
const gherkinParse = require('gherkin-parse');

// Paths for storing credentials
const jiraCredentialsPath = path.join(app.getPath('userData'), 'jira-credentials.json');
const apiKeyPath = path.join(app.getPath('userData'), 'openai-api-key.json');

// Simple helper functions for Jira credential storage
function saveJiraCredentials(credentials) {
  try {
    fs.writeFileSync(jiraCredentialsPath, JSON.stringify(credentials, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving Jira credentials:', error);
    return false;
  }
}

function loadJiraCredentials() {
  try {
    if (fs.existsSync(jiraCredentialsPath)) {
      const data = fs.readFileSync(jiraCredentialsPath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error loading Jira credentials:', error);
    return null;
  }
}

function clearJiraCredentials() {
  try {
    if (fs.existsSync(jiraCredentialsPath)) {
      fs.unlinkSync(jiraCredentialsPath);
    }
    return true;
  } catch (error) {
    console.error('Error clearing Jira credentials:', error);
    return false;
  }
}

// Helper functions for OpenAI API key storage
function saveApiKey(apiKey) {
  try {
    fs.writeFileSync(apiKeyPath, JSON.stringify({ apiKey }, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving API key:', error);
    return false;
  }
}

function loadApiKey() {
  try {
    if (fs.existsSync(apiKeyPath)) {
      const data = fs.readFileSync(apiKeyPath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.apiKey;
    }
    return null;
  } catch (error) {
    console.error('Error loading API key:', error);
    return null;
  }
}

function clearApiKey() {
  try {
    if (fs.existsSync(apiKeyPath)) {
      fs.unlinkSync(apiKeyPath);
    }
    return true;
  } catch (error) {
    console.error('Error clearing API key:', error);
    return false;
  }
}

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development mode
  // mainWindow.webContents.openDevTools();
}

// Create window when Electron is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS, re-create a window when the dock icon is clicked and no other windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle PDF file selection
ipcMain.handle('select-pdf', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  
  if (canceled) {
    return { success: false };
  }
  
  return { 
    success: true, 
    filePath: filePaths[0],
    fileName: path.basename(filePaths[0])
  };
});

// Handle PDF processing and ChatGPT conversion
ipcMain.handle('process-pdf', async (event, filePath, apiKey) => {
  try {
    // Read the PDF file
    const dataBuffer = fs.readFileSync(filePath);
    
    // Extract text from PDF
    const pdfData = await pdfParse(dataBuffer);
    const pdfText = pdfData.text;
    
    // Initialize OpenAI with the provided API key
    const openai = new OpenAI({
      apiKey: apiKey
    });
    
    // Send the PDF content to ChatGPT for conversion to Gherkin format
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a requirements analyst who converts requirements documents into Gherkin feature files. Extract user stories and requirements from the provided text and convert them into well-structured Gherkin feature files with Feature, Background (if needed), and Scenario/Scenario Outline sections. Use proper Gherkin syntax with Given, When, Then, And, But keywords. Group related scenarios into features logically."
        },
        {
          role: "user",
          content: `Convert the following requirements document into Gherkin feature files:\n\n${pdfText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });
    
    // Extract the Gherkin content from the response
    let gherkinContent = response.choices[0].message.content;
    
    // Remove all markdown code block markers
    gherkinContent = gherkinContent.replace(/```gherkin\s*/g, '');
    gherkinContent = gherkinContent.replace(/```\s*/g, '');
    
    return {
      success: true,
      gherkinContent
    };
  } catch (error) {
    console.error('Error processing PDF:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Parse Gherkin content to extract Features, Scenarios, and Given statements
function parseGherkinContent(gherkinContent) {
  try {
    // First, split the content into feature blocks
    const featureBlocks = gherkinContent.split(/Feature:/)
      .filter(block => block.trim().length > 0)
      .map(block => `Feature:${block.trim()}`);
    
    const parsedFeatures = [];
    
    for (let i = 0; i < featureBlocks.length; i++) {
      const featureContent = featureBlocks[i];
      
      // Extract feature name
      const featureNameMatch = featureContent.match(/Feature:\s*([^\n]+)/);
      const featureName = featureNameMatch ? featureNameMatch[1].trim() : `Feature_${i + 1}`;
      
      // Extract Scenarios
      const scenarioBlocks = featureContent.split(/\n\s*Scenario(?:\s+Outline)?:/)
        .slice(1) // Skip the feature description part
        .map(block => `Scenario: ${block.trim()}`);
      
      // Extract Given statements and their corresponding scenarios
      const givenStatements = [];
      const scenarioMap = {};
      
      for (const scenarioBlock of scenarioBlocks) {
        // Extract scenario name
        const scenarioNameMatch = scenarioBlock.match(/Scenario(?:\s+Outline)?:\s*([^\n]+)/);
        const scenarioName = scenarioNameMatch ? scenarioNameMatch[1].trim() : '';
        
        // Extract Given statements from this scenario
        const givenMatches = scenarioBlock.match(/Given\s+([^\n]+)/g) || [];
        
        for (const given of givenMatches) {
          const givenText = given.replace(/^Given\s+/, '').trim();
          givenStatements.push(givenText);
          scenarioMap[givenText] = {
            name: scenarioName,
            content: scenarioBlock
          };
        }
      }
      
      // If no scenarios found, try to extract Given statements directly
      if (givenStatements.length === 0) {
        const givenMatches = featureContent.match(/Given\s+([^\n]+)/g) || [];
        givenStatements.push(...givenMatches.map(given => given.replace(/^Given\s+/, '').trim()));
      }
      
      parsedFeatures.push({
        name: featureName,
        content: featureContent,
        givenStatements,
        scenarioMap
      });
    }
    
    return parsedFeatures;
  } catch (error) {
    console.error('Error parsing Gherkin content:', error);
    throw error;
  }
}

// Handle saving Gherkin feature files
ipcMain.handle('save-feature-files', async (event, gherkinContent) => {
  try {
    // Show dialog to select save directory
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    
    if (canceled) {
      return { success: false };
    }
    
    const saveDir = filePaths[0];
    
    // Parse the Gherkin content to separate features
    const featureBlocks = gherkinContent.split(/Feature:/)
      .filter(block => block.trim().length > 0)
      .map(block => `Feature:${block.trim()}`);
    
    // Save each feature to a separate file
    const savedFiles = [];
    
    for (let i = 0; i < featureBlocks.length; i++) {
      const featureContent = featureBlocks[i];
      
      // Extract feature name for filename
      const featureNameMatch = featureContent.match(/Feature:\s*([^\n]+)/);
      const featureName = featureNameMatch ? featureNameMatch[1].trim() : `Feature_${i + 1}`;
      
      // Create safe filename (without "gherkin" in the name)
      const safeFileName = `${featureName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.feature`;
      const filePath = path.join(saveDir, safeFileName);
      
      // Add a space at the end of the feature content to ensure separation between features
      const formattedContent = featureContent.trim() + '\n\n';
      
      // Write the feature file
      fs.writeFileSync(filePath, formattedContent);
      savedFiles.push(filePath);
    }
    
    return {
      success: true,
      savedFiles
    };
  } catch (error) {
    console.error('Error saving feature files:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Create Jira client
function createJiraClient(jiraConfig) {
  const { url, username, apiToken } = jiraConfig;
  
  return new JiraClient({
    protocol: url.startsWith('https') ? 'https' : 'http',
    host: url.replace(/^https?:\/\//, ''),
    username: username,
    password: apiToken,
    apiVersion: '2',
    strictSSL: true
  });
}

// Test Jira connection
ipcMain.handle('test-jira-connection', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Test connection by getting the current user
    const user = await jira.getCurrentUser();
    
    return {
      success: true,
      user: {
        name: user.name,
        displayName: user.displayName,
        emailAddress: user.emailAddress
      }
    };
  } catch (error) {
    console.error('Error testing Jira connection:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get Jira projects
ipcMain.handle('get-jira-projects', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all projects
    const projects = await jira.listProjects();
    
    return {
      success: true,
      projects: projects.map(project => ({
        id: project.id,
        key: project.key,
        name: project.name
      }))
    };
  } catch (error) {
    console.error('Error getting Jira projects:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get Jira issue types
ipcMain.handle('get-jira-issue-types', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all issue types
    const issueTypes = await jira.listIssueTypes();
    
    return {
      success: true,
      issueTypes: issueTypes.map(type => ({
        id: type.id,
        name: type.name,
        description: type.description,
        subtask: type.subtask
      }))
    };
  } catch (error) {
    console.error('Error getting Jira issue types:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get Jira fields
ipcMain.handle('get-jira-fields', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all fields
    const fields = await jira.listFields();
    
    // Filter for custom fields
    const customFields = fields.filter(field => field.custom);
    
    return {
      success: true,
      fields: customFields.map(field => ({
        id: field.id,
        name: field.name,
        custom: field.custom,
        schema: field.schema
      }))
    };
  } catch (error) {
    console.error('Error getting Jira fields:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Search Jira issues
ipcMain.handle('search-jira-issues', async (event, { jiraConfig, projectKey }) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Search for Initiative issues in the project
    const result = await jira.searchJira(`project = ${projectKey} AND issuetype = Initiative ORDER BY created DESC`, {
      maxResults: 100,
      fields: ['key', 'summary', 'issuetype']
    });
    
    return {
      success: true,
      issues: result.issues.map(issue => ({
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype.name
      }))
    };
  } catch (error) {
    // If the search fails (possibly because Initiative type doesn't exist), try a fallback search
    try {
      const jira = createJiraClient(jiraConfig);
      
      // Get all issue types to find the highest level type
      const issueTypes = await jira.listIssueTypes();
      
      // Look for Initiative, Epic, or other high-level issue types
      const highLevelTypes = issueTypes
        .filter(type => 
          type.name.includes('Initiative') || 
          type.name.includes('Epic') || 
          type.name.includes('Theme') ||
          type.name.includes('Program')
        )
        .map(type => type.name);
      
      // If we found high-level types, search for them
      if (highLevelTypes.length > 0) {
        const typeClause = highLevelTypes
          .map(type => `issuetype = "${type}"`)
          .join(' OR ');
        
        const result = await jira.searchJira(`project = ${projectKey} AND (${typeClause}) ORDER BY created DESC`, {
          maxResults: 100,
          fields: ['key', 'summary', 'issuetype']
        });
        
        return {
          success: true,
          issues: result.issues.map(issue => ({
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary,
            issueType: issue.fields.issuetype.name
          }))
        };
      } else {
        // If no high-level types found, just return an empty list
        return {
          success: true,
          issues: []
        };
      }
    } catch (fallbackError) {
      console.error('Error in fallback search:', fallbackError);
      return {
        success: false,
        error: error.message
      };
    }
  }
});

// Save Jira credentials
ipcMain.handle('save-jira-credentials', async (event, credentials) => {
  try {
    const success = saveJiraCredentials(credentials);
    return { success };
  } catch (error) {
    console.error('Error saving Jira credentials:', error);
    return { success: false, error: error.message };
  }
});

// Load Jira credentials
ipcMain.handle('load-jira-credentials', async () => {
  try {
    const credentials = loadJiraCredentials();
    return { 
      success: true, 
      credentials: credentials || null 
    };
  } catch (error) {
    console.error('Error loading Jira credentials:', error);
    return { success: false, error: error.message };
  }
});

// Clear Jira credentials
ipcMain.handle('clear-jira-credentials', async () => {
  try {
    const success = clearJiraCredentials();
    return { success };
  } catch (error) {
    console.error('Error clearing Jira credentials:', error);
    return { success: false, error: error.message };
  }
});

// Save OpenAI API key
ipcMain.handle('save-api-key', async (event, apiKey) => {
  try {
    const success = saveApiKey(apiKey);
    return { success };
  } catch (error) {
    console.error('Error saving API key:', error);
    return { success: false, error: error.message };
  }
});

// Load OpenAI API key
ipcMain.handle('load-api-key', async () => {
  try {
    const apiKey = loadApiKey();
    return { 
      success: true, 
      apiKey: apiKey || null 
    };
  } catch (error) {
    console.error('Error loading API key:', error);
    return { success: false, error: error.message };
  }
});

// Clear OpenAI API key
ipcMain.handle('clear-api-key', async () => {
  try {
    const success = clearApiKey();
    return { success };
  } catch (error) {
    console.error('Error clearing API key:', error);
    return { success: false, error: error.message };
  }
});

// Get project-specific issue types
ipcMain.handle('get-project-issue-types', async (event, { jiraConfig, projectKey }) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all issue types
    const issueTypes = await jira.listIssueTypes();
    
    // Get project
    const project = await jira.getProject(projectKey);
    
    return {
      success: true,
      issueTypes: issueTypes.map(type => ({
        id: type.id,
        name: type.name,
        description: type.description,
        subtask: type.subtask
      }))
    };
  } catch (error) {
    console.error(`Error getting issue types for project ${projectKey}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get issue type fields
ipcMain.handle('get-issue-type-fields', async (event, { jiraConfig, projectKey, issueTypeId }) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all fields
    const allFields = await jira.listFields();
    
    // Filter for custom fields that might be related to Epics
    const epicNameFields = allFields.filter(field => 
      field.name.toLowerCase().includes('epic') && 
      field.name.toLowerCase().includes('name')
    );
    
    const epicLinkFields = allFields.filter(field => 
      field.name.toLowerCase().includes('epic') && 
      field.name.toLowerCase().includes('link')
    );
    
    // Determine which fields to return based on the issue type
    const issueTypes = await jira.listIssueTypes();
    const issueType = issueTypes.find(type => type.id === issueTypeId);
    
    if (!issueType) {
      throw new Error(`Issue type ${issueTypeId} not found`);
    }
    
    let relevantFields = [];
    
    if (issueType.name.toLowerCase() === 'epic') {
      relevantFields = epicNameFields;
    } else {
      relevantFields = epicLinkFields;
    }
    
    return {
      success: true,
      fields: relevantFields.map(field => ({
        id: field.id,
        name: field.name,
        required: false,
        schema: field.schema
      }))
    };
  } catch (error) {
    console.error(`Error getting fields for issue type ${issueTypeId} in project ${projectKey}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Create Jira issues from Gherkin content
ipcMain.handle('create-jira-issues', async (event, { gherkinContent, jiraConfig }) => {
  try {
    const { 
      url, 
      username, 
      apiToken, 
      projectKey, 
      parentIssueKey,
      epicNameField = 'customfield_10011',
      epicLinkField = 'customfield_10010',
      epicType = 'Epic',
      storyType = 'Story'
    } = jiraConfig;
    
    // Create Jira client
    const jira = new JiraClient({
      protocol: url.startsWith('https') ? 'https' : 'http',
      host: url.replace(/^https?:\/\//, ''),
      username: username,
      password: apiToken,
      apiVersion: '2',
      strictSSL: true
    });
    
    // Parse Gherkin content
    const parsedFeatures = parseGherkinContent(gherkinContent);
    
    // Create issues in Jira
    const createdIssues = [];
    
    for (const feature of parsedFeatures) {
      // Create Epic for the Feature
      const epicFields = {
        project: {
          key: projectKey
        },
        summary: feature.name,
        description: feature.content,
        issuetype: {
          name: epicType
        }
      };
      
      // Add Epic Name field if configured and if the issue type is Epic
      // Some Jira instances only allow Epic Name field to be set on Epic issue types
      if (epicNameField && epicType.toLowerCase() === 'epic') {
        epicFields[epicNameField] = feature.name;
      }
      
      // Add Epic Description field with all Feature details
      epicFields['customfield_11037'] = feature.content;
      
      const epicIssue = await jira.addNewIssue({
        fields: epicFields
      });
      
      createdIssues.push({
        key: epicIssue.key,
        type: 'epic',
        summary: feature.name,
        url: `${url}/browse/${epicIssue.key}`
      });
      
      // Link Epic to parent if specified
      if (parentIssueKey) {
        try {
          await jira.issueLink({
            type: {
              name: 'Relates' // This link type may vary in your Jira instance
            },
            inwardIssue: {
              key: parentIssueKey
            },
            outwardIssue: {
              key: epicIssue.key
            }
          });
        } catch (linkError) {
          console.error(`Error linking Epic ${epicIssue.key} to parent ${parentIssueKey}:`, linkError);
        }
      }
      
      // Create Stories for each Given statement
      for (const givenStatement of feature.givenStatements) {
        try {
          // Get the scenario for this Given statement if available
          const scenario = feature.scenarioMap && feature.scenarioMap[givenStatement];
          
          // Create description with scenario content if available
          let description;
          if (scenario) {
            description = `From Feature: ${feature.name}\n\n${scenario.content}`;
          } else {
            description = `From Feature: ${feature.name}\n\nGiven ${givenStatement}`;
          }
          
          const storyFields = {
            project: {
              key: projectKey
            },
            summary: givenStatement,
            description: description,
            issuetype: {
              name: storyType
            }
          };
          
          // Add Scenario information to the Story field (field ID 10577)
          if (scenario) {
            storyFields['customfield_10577'] = scenario.content;
          } else {
            storyFields['customfield_10577'] = `Given ${givenStatement}`;
          }
          
          // Add Epic Link field if configured
          if (epicLinkField) {
            storyFields[epicLinkField] = epicIssue.key;
          }
          
          const storyIssue = await jira.addNewIssue({
            fields: storyFields
          });
          
          createdIssues.push({
            key: storyIssue.key,
            type: 'story',
            summary: givenStatement,
            epicKey: epicIssue.key,
            url: `${url}/browse/${storyIssue.key}`
          });
        } catch (storyError) {
          console.error(`Error creating Story for "${givenStatement}":`, storyError);
        }
      }
    }
    
    return {
      success: true,
      createdIssues
    };
  } catch (error) {
    console.error('Error creating Jira issues:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
