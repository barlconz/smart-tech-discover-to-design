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
          content: "You are a requirements analyst who converts requirements documents into Gherkin feature files. Extract user stories and requirements from the provided text and convert them into well-structured Gherkin feature files with Feature, Background (if needed), and Scenario/Scenario Outline sections. Use proper Gherkin syntax with Given, When, Then, And, But keywords. Group related scenarios into features logically. Ensure each Scenario follows the standard Gherkin format with a clear title and proper Given/When/Then steps. Each Feature should have a descriptive title and may include a brief description of the feature's purpose."
        },
        {
          role: "user",
          content: `Convert the following requirements document into Gherkin feature files. Follow proper Gherkin syntax and ensure each Scenario has a descriptive title followed by Given/When/Then steps:\n\n${pdfText}`
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

// Parse Gherkin content to extract Features and Scenarios in Gherkin format
function parseGherkinContent(gherkinContent) {
  try {
    // First, split the content into feature blocks
    const featureBlocks = gherkinContent.split(/Feature:/)
      .filter(block => block.trim().length > 0)
      .map(block => `Feature:${block.trim()}`);
    
    console.log('Feature blocks count:', featureBlocks.length);
    
    const parsedFeatures = [];
    
    for (let i = 0; i < featureBlocks.length; i++) {
      const featureContent = featureBlocks[i];
      
      // Extract feature name
      const featureNameMatch = featureContent.match(/Feature:\s*([^\n]+)/);
      const featureName = featureNameMatch ? featureNameMatch[1].trim() : `Feature_${i + 1}`;
      
      console.log(`Processing feature: ${featureName}`);
      
      // Log the feature content for debugging
      if (featureName.includes('Continuous Learning')) {
        console.log('Feature content:', featureContent);
      }
      
      // Extract Scenarios - improved regex to handle various formatting
      const scenarioRegex = /\n\s*Scenario(?:\s+Outline)?(?:\s*):(?:\s*)/;
      const scenarioBlocks = featureContent.split(scenarioRegex)
        .slice(1) // Skip the feature description part
        .map(block => `Scenario: ${block.trim()}`);
      
      console.log(`Found ${scenarioBlocks.length} scenarios in feature: ${featureName}`);
      
      // Log the scenario blocks for debugging
      if (featureName.includes('Continuous Learning')) {
        console.log('Scenario blocks:', scenarioBlocks);
      }
      
      // Store scenarios with their names and content
      const scenarios = [];
      
      for (const scenarioBlock of scenarioBlocks) {
        // Extract scenario name
        const scenarioNameMatch = scenarioBlock.match(/Scenario(?:\s+Outline)?:\s*([^\n]+)/);
        const scenarioName = scenarioNameMatch ? scenarioNameMatch[1].trim() : '';
        
        scenarios.push({
          name: scenarioName,
          content: scenarioBlock
        });
      }
      
      parsedFeatures.push({
        name: featureName,
        content: featureContent,
        scenarios
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
      
      // Log the parsed features and scenarios for debugging
      console.log('Parsed Features:', parsedFeatures.map(f => ({
        name: f.name,
        scenarioCount: f.scenarios.length,
        scenarios: f.scenarios.map(s => s.name)
      })));
    
    // Create issues in Jira
    const createdIssues = [];
    
    for (const feature of parsedFeatures) {
      // Format the feature content with bold keywords for Epic description
      let formattedFeature = feature.content;
      
      // Bold the Feature keyword and add space after keywords
      formattedFeature = formattedFeature
        .replace(/^(Feature:)/gm, '*$1* ')
        .replace(/^Scenario:/gm, '*Scenario:*')
        .replace(/^Scenario Outline:/gm, '*Scenario Outline:*')
        .replace(/^(\s*)(Given)/gm, '$1*$2* ')
        .replace(/^(\s*)(When)/gm, '$1*$2* ')
        .replace(/^(\s*)(Then)/gm, '$1*$2* ')
        .replace(/^(\s*)(And)/gm, '$1*$2* ')
        .replace(/^(\s*)(But)/gm, '$1*$2* ');
      
      // Create Epic for the Feature
      const epicFields = {
        project: {
          key: projectKey
        },
        summary: feature.name,
        description: formattedFeature,
        issuetype: {
          name: epicType
        }
      };
      
      // Set parent issue if specified - this creates the Epic as a child of the Initiative
      if (parentIssueKey) {
        epicFields['parent'] = {
          key: parentIssueKey
        };
      }
      
      // Add Epic Name field if configured and if the issue type is Epic
      // Some Jira instances only allow Epic Name field to be set on Epic issue types
      if (epicNameField && epicType.toLowerCase() === 'epic') {
        epicFields[epicNameField] = feature.name;
      }
      
      
      // Add Epic Description field with formatted Feature details
      epicFields['customfield_11037'] = formattedFeature;
      
      const epicIssue = await jira.addNewIssue({
        fields: epicFields
      });
      
      createdIssues.push({
        key: epicIssue.key,
        type: 'epic',
        summary: feature.name,
        url: `${url}/browse/${epicIssue.key}`
      });
      
      // No need to link Epic to parent after creation as we set the parent directly in the Epic fields
      
      // Create Stories for each Scenario
      for (const scenario of feature.scenarios) {
        try {
          // Format the scenario in proper Gherkin style with bold keywords and proper indentation
          let formattedScenario = scenario.content;
          
          // Bold the Gherkin keywords and add space after keywords
          formattedScenario = formattedScenario
            .replace(/^Scenario:/gm, '*Scenario:*')
            .replace(/^Scenario Outline:/gm, '*Scenario Outline:*')
            .replace(/^(\s*)(Given)/gm, '$1*$2* ')
            .replace(/^(\s*)(When)/gm, '$1*$2* ')
            .replace(/^(\s*)(Then)/gm, '$1*$2* ')
            .replace(/^(\s*)(And)/gm, '$1*$2* ')
            .replace(/^(\s*)(But)/gm, '$1*$2* ');
          
          // Create description with scenario content
          const description = `From *Feature*: ${feature.name}\n\n${formattedScenario}`;
          
          const storyFields = {
            project: {
              key: projectKey
            },
            summary: scenario.name,
            description: description,
            issuetype: {
              name: storyType
            }
          };
          
          // Add Scenario information to the Story field (field ID 10577)
          storyFields['customfield_10577'] = formattedScenario;
          
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
            summary: scenario.name,
            epicKey: epicIssue.key,
            url: `${url}/browse/${storyIssue.key}`
          });
        } catch (storyError) {
          console.error(`Error creating Story for scenario "${scenario.name}":`, storyError);
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
