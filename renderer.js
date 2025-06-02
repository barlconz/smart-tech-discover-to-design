// DOM Elements
const selectPdfBtn = document.getElementById('select-pdf-btn');
const selectedFileDiv = document.getElementById('selected-file');
const fileNameSpan = document.getElementById('file-name');
const apiKeyInput = document.getElementById('api-key');
const processBtn = document.getElementById('process-btn');
const resultSection = document.getElementById('result-section');
const gherkinOutput = document.getElementById('gherkin-output');
const saveBtn = document.getElementById('save-btn');
const jiraBtn = document.getElementById('jira-btn');
const jiraSection = document.getElementById('jira-section');
const jiraUrlInput = document.getElementById('jira-url');
const jiraUsernameInput = document.getElementById('jira-username');
const jiraApiTokenInput = document.getElementById('jira-api-token');
const saveCredentialsBtn = document.getElementById('save-credentials-btn');
const clearCredentialsBtn = document.getElementById('clear-credentials-btn');
const jiraProjectSelect = document.getElementById('jira-project');
const jiraEpicTypeSelect = document.getElementById('jira-epic-type');
const jiraStoryTypeSelect = document.getElementById('jira-story-type');
const jiraParentSelect = document.getElementById('jira-parent');
const jiraEpicNameFieldSelect = document.getElementById('jira-epic-name-field');
const jiraEpicLinkFieldSelect = document.getElementById('jira-epic-link-field');
const testJiraBtn = document.getElementById('test-jira-btn');
const loadJiraDataBtn = document.getElementById('load-jira-data-btn');
const jiraDataSection = document.getElementById('jira-data-section');
const createJiraBtn = document.getElementById('create-jira-btn');
const jiraResult = document.getElementById('jira-result');
const jiraResultContent = document.getElementById('jira-result-content');
const loadingDiv = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const statusMessage = document.getElementById('status-message');

// State variables
let selectedFilePath = null;
let gherkinContent = null;

// Helper functions
function showLoading(message) {
  loadingText.textContent = message;
  loadingDiv.classList.remove('hidden');
}

function hideLoading() {
  loadingDiv.classList.add('hidden');
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden');
  statusMessage.classList.toggle('error', isError);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 5000);
}

function validateInputs() {
  const apiKey = apiKeyInput.value.trim();
  processBtn.disabled = !selectedFilePath || !apiKey;
}

// Event listeners
selectPdfBtn.addEventListener('click', async () => {
  try {
    const result = await window.api.selectPdf();
    
    if (result.success) {
      selectedFilePath = result.filePath;
      fileNameSpan.textContent = result.fileName;
      selectedFileDiv.classList.remove('hidden');
      validateInputs();
    }
  } catch (error) {
    showStatus(`Error selecting PDF: ${error.message}`, true);
  }
});

// Load saved API key when the page loads
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await window.api.loadApiKey();
    if (result.success && result.apiKey) {
      apiKeyInput.value = result.apiKey;
      validateInputs();
    }
  } catch (error) {
    console.error('Error loading API key:', error);
  }
});

apiKeyInput.addEventListener('input', validateInputs);

// Save API key when it changes
apiKeyInput.addEventListener('change', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    try {
      await window.api.saveApiKey(apiKey);
    } catch (error) {
      console.error('Error saving API key:', error);
    }
  }
});

processBtn.addEventListener('click', async () => {
  if (!selectedFilePath) {
    showStatus('Please select a PDF file first', true);
    return;
  }
  
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showStatus('Please enter your OpenAI API key', true);
    return;
  }
  
  try {
    showLoading('Processing PDF with ChatGPT...');
    
    const result = await window.api.processPdf(selectedFilePath, apiKey);
    
    hideLoading();
    
    if (result.success) {
      gherkinContent = result.gherkinContent;
      gherkinOutput.textContent = gherkinContent;
      resultSection.classList.remove('hidden');
      showStatus('PDF successfully processed!');
    } else {
      showStatus(`Error processing PDF: ${result.error}`, true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error processing PDF: ${error.message}`, true);
  }
});

saveBtn.addEventListener('click', async () => {
  if (!gherkinContent) {
    showStatus('No Gherkin content to save', true);
    return;
  }
  
  try {
    showLoading('Saving feature files...');
    
    const result = await window.api.saveFeatureFiles(gherkinContent);
    
    hideLoading();
    
    if (result.success) {
      const fileCount = result.savedFiles.length;
      showStatus(`Successfully saved ${fileCount} feature file${fileCount !== 1 ? 's' : ''}!`);
    } else {
      showStatus('Saving was cancelled or failed', true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error saving feature files: ${error.message}`, true);
  }
});

// Show Jira integration section
jiraBtn.addEventListener('click', async () => {
  if (!gherkinContent) {
    showStatus('No Gherkin content to push to Jira', true);
    return;
  }
  
  jiraSection.classList.remove('hidden');
  jiraResult.classList.add('hidden');
  
  // Load saved credentials if available
  try {
    const result = await window.api.loadJiraCredentials();
    if (result.success && result.credentials) {
      jiraUrlInput.value = result.credentials.url || '';
      jiraUsernameInput.value = result.credentials.username || '';
      jiraApiTokenInput.value = result.credentials.apiToken || '';
    }
  } catch (error) {
    console.error('Error loading credentials:', error);
  }
  
  // Scroll to Jira section
  jiraSection.scrollIntoView({ behavior: 'smooth' });
});

// Save Jira credentials
saveCredentialsBtn.addEventListener('click', async () => {
  const credentials = {
    url: jiraUrlInput.value.trim(),
    username: jiraUsernameInput.value.trim(),
    apiToken: jiraApiTokenInput.value.trim()
  };
  
  if (!validateJiraConfig(credentials, ['url', 'username', 'apiToken'])) {
    return;
  }
  
  try {
    const result = await window.api.saveJiraCredentials(credentials);
    if (result.success) {
      showStatus('Credentials saved successfully!');
    } else {
      showStatus('Failed to save credentials', true);
    }
  } catch (error) {
    showStatus(`Error saving credentials: ${error.message}`, true);
  }
});

// Clear Jira credentials
clearCredentialsBtn.addEventListener('click', async () => {
  try {
    const result = await window.api.clearJiraCredentials();
    if (result.success) {
      jiraUrlInput.value = '';
      jiraUsernameInput.value = '';
      jiraApiTokenInput.value = '';
      showStatus('Credentials cleared successfully!');
    } else {
      showStatus('Failed to clear credentials', true);
    }
  } catch (error) {
    showStatus(`Error clearing credentials: ${error.message}`, true);
  }
});

// Test Jira connection
testJiraBtn.addEventListener('click', async () => {
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken'])) {
    return;
  }
  
  try {
    showLoading('Testing Jira connection...');
    
    const result = await window.api.testJiraConnection(jiraConfig);
    
    hideLoading();
    
    if (result.success) {
      showStatus(`Successfully connected to Jira as ${result.user.displayName}!`);
      loadJiraDataBtn.disabled = false;
    } else {
      showStatus(`Error connecting to Jira: ${result.error}`, true);
      loadJiraDataBtn.disabled = true;
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error connecting to Jira: ${error.message}`, true);
    loadJiraDataBtn.disabled = true;
  }
});

// Load Jira data
loadJiraDataBtn.addEventListener('click', async () => {
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken'])) {
    return;
  }
  
  try {
    showLoading('Loading Jira data...');
    
    // Load projects
    const projectsResult = await window.api.getJiraProjects(jiraConfig);
    if (!projectsResult.success) {
      throw new Error(projectsResult.error || 'Failed to load Jira projects');
    }
    
    // Load issue types
    const issueTypesResult = await window.api.getJiraIssueTypes(jiraConfig);
    if (!issueTypesResult.success) {
      throw new Error(issueTypesResult.error || 'Failed to load Jira issue types');
    }
    
    // Load custom fields
    const fieldsResult = await window.api.getJiraFields(jiraConfig);
    if (!fieldsResult.success) {
      throw new Error(fieldsResult.error || 'Failed to load Jira fields');
    }
    
    // Populate dropdowns
    populateProjectsDropdown(projectsResult.projects);
    populateIssueTypesDropdowns(issueTypesResult.issueTypes);
    populateCustomFieldsDropdowns(fieldsResult.fields);
    
    // Show the data section
    jiraDataSection.classList.remove('hidden');
    
    hideLoading();
    showStatus('Jira data loaded successfully!');
  } catch (error) {
    hideLoading();
    showStatus(`Error loading Jira data: ${error.message}`, true);
  }
});

// Helper function to populate projects dropdown
function populateProjectsDropdown(projects) {
  // Clear existing options except the first one
  jiraProjectSelect.innerHTML = '<option value="">Select a project</option>';
  
  // Add projects
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.key;
    option.textContent = `${project.name} (${project.key})`;
    jiraProjectSelect.appendChild(option);
  });
  
  // Remove any existing event listeners
  jiraProjectSelect.removeEventListener('change', handleProjectChange);
  
  // Add event listener to load project-specific data when project is selected
  jiraProjectSelect.addEventListener('change', handleProjectChange);
}

// Handle project selection change
async function handleProjectChange() {
  const projectKey = jiraProjectSelect.value;
  
  if (!projectKey) {
    // Clear dropdowns if no project selected
    jiraParentSelect.innerHTML = '<option value="">None</option>';
    jiraEpicTypeSelect.innerHTML = '<option value="Epic">Epic</option>';
    jiraStoryTypeSelect.innerHTML = '<option value="Story">Story</option>';
    return;
  }
  
  try {
    showLoading('Loading project data...');
    
    const jiraConfig = getJiraConfig();
    
    // Load project-specific issue types
    const issueTypesResult = await window.api.getProjectIssueTypes(jiraConfig, projectKey);
    if (!issueTypesResult.success) {
      throw new Error(issueTypesResult.error || 'Failed to load project issue types');
    }
    
    // Populate issue type dropdowns with project-specific types
    populateProjectIssueTypesDropdowns(issueTypesResult.issueTypes);
    
    // Load issues for parent selection
    await loadProjectIssues(projectKey);
    
    hideLoading();
  } catch (error) {
    hideLoading();
    showStatus(`Error loading project data: ${error.message}`, true);
  }
}

// Helper function to populate issue types dropdowns with all issue types
function populateIssueTypesDropdowns(issueTypes) {
  // Clear existing options
  jiraEpicTypeSelect.innerHTML = '';
  jiraStoryTypeSelect.innerHTML = '';
  
  // Filter for non-subtask issue types
  const regularIssueTypes = issueTypes.filter(type => !type.subtask);
  
  // Add issue types
  regularIssueTypes.forEach(type => {
    // Add to Epic type dropdown
    const epicOption = document.createElement('option');
    epicOption.value = type.name;
    epicOption.textContent = type.name;
    if (type.name === 'Epic') {
      epicOption.selected = true;
    }
    jiraEpicTypeSelect.appendChild(epicOption);
    
    // Add to Story type dropdown
    const storyOption = document.createElement('option');
    storyOption.value = type.name;
    storyOption.textContent = type.name;
    if (type.name === 'Story') {
      storyOption.selected = true;
    }
    jiraStoryTypeSelect.appendChild(storyOption);
  });
  
  // Add event listeners for issue type changes
  jiraEpicTypeSelect.addEventListener('change', handleEpicTypeChange);
  jiraStoryTypeSelect.addEventListener('change', handleStoryTypeChange);
}

// Helper function to populate issue types dropdowns with project-specific issue types
function populateProjectIssueTypesDropdowns(issueTypes) {
  // Clear existing options
  jiraEpicTypeSelect.innerHTML = '';
  jiraStoryTypeSelect.innerHTML = '';
  
  // Filter for non-subtask issue types
  const regularIssueTypes = issueTypes.filter(type => !type.subtask);
  
  // Add issue types
  regularIssueTypes.forEach(type => {
    // Add to Epic type dropdown
    const epicOption = document.createElement('option');
    epicOption.value = type.name;
    epicOption.textContent = type.name;
    epicOption.dataset.id = type.id; // Store the ID for field lookup
    if (type.name === 'Epic') {
      epicOption.selected = true;
    }
    jiraEpicTypeSelect.appendChild(epicOption);
    
    // Add to Story type dropdown
    const storyOption = document.createElement('option');
    storyOption.value = type.name;
    storyOption.textContent = type.name;
    storyOption.dataset.id = type.id; // Store the ID for field lookup
    if (type.name === 'Story') {
      storyOption.selected = true;
    }
    jiraStoryTypeSelect.appendChild(storyOption);
  });
  
  // Trigger field loading for the selected issue types
  handleEpicTypeChange();
  handleStoryTypeChange();
}

// Handle Epic type selection change
async function handleEpicTypeChange() {
  const projectKey = jiraProjectSelect.value;
  if (!projectKey) return;
  
  const selectedOption = jiraEpicTypeSelect.options[jiraEpicTypeSelect.selectedIndex];
  const issueTypeId = selectedOption.dataset.id;
  if (!issueTypeId) return;
  
  try {
    showLoading('Loading Epic type fields...');
    
    const jiraConfig = getJiraConfig();
    const result = await window.api.getIssueTypeFields(jiraConfig, projectKey, issueTypeId);
    
    if (result.success) {
      // Find Epic Name field if it exists for this issue type
      const epicNameFields = result.fields.filter(field => 
        field.name.toLowerCase().includes('epic') && 
        field.name.toLowerCase().includes('name')
      );
      
      if (epicNameFields.length > 0) {
        // Update Epic Name field dropdown
        jiraEpicNameFieldSelect.innerHTML = '';
        epicNameFields.forEach(field => {
          const option = document.createElement('option');
          option.value = field.id;
          option.textContent = `${field.name} (${field.id})`;
          jiraEpicNameFieldSelect.appendChild(option);
        });
      }
    }
    
    hideLoading();
  } catch (error) {
    hideLoading();
    console.error('Error loading Epic type fields:', error);
  }
}

// Handle Story type selection change
async function handleStoryTypeChange() {
  const projectKey = jiraProjectSelect.value;
  if (!projectKey) return;
  
  const selectedOption = jiraStoryTypeSelect.options[jiraStoryTypeSelect.selectedIndex];
  const issueTypeId = selectedOption.dataset.id;
  if (!issueTypeId) return;
  
  try {
    showLoading('Loading Story type fields...');
    
    const jiraConfig = getJiraConfig();
    const result = await window.api.getIssueTypeFields(jiraConfig, projectKey, issueTypeId);
    
    if (result.success) {
      // Find Epic Link field if it exists for this issue type
      const epicLinkFields = result.fields.filter(field => 
        field.name.toLowerCase().includes('epic') && 
        field.name.toLowerCase().includes('link')
      );
      
      if (epicLinkFields.length > 0) {
        // Update Epic Link field dropdown
        jiraEpicLinkFieldSelect.innerHTML = '';
        epicLinkFields.forEach(field => {
          const option = document.createElement('option');
          option.value = field.id;
          option.textContent = `${field.name} (${field.id})`;
          jiraEpicLinkFieldSelect.appendChild(option);
        });
      }
    }
    
    hideLoading();
  } catch (error) {
    hideLoading();
    console.error('Error loading Story type fields:', error);
  }
}

// Helper function to populate custom fields dropdowns
function populateCustomFieldsDropdowns(fields) {
  // Clear existing options
  jiraEpicNameFieldSelect.innerHTML = '';
  jiraEpicLinkFieldSelect.innerHTML = '';
  
  // Add fields that might be Epic Name fields
  const epicNameFields = fields.filter(field => 
    field.name.toLowerCase().includes('epic') && 
    field.name.toLowerCase().includes('name')
  );
  
  if (epicNameFields.length > 0) {
    epicNameFields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.id;
      option.textContent = `${field.name} (${field.id})`;
      jiraEpicNameFieldSelect.appendChild(option);
    });
  } else {
    // Add default option
    const option = document.createElement('option');
    option.value = 'customfield_10011';
    option.textContent = 'customfield_10011 (default)';
    jiraEpicNameFieldSelect.appendChild(option);
  }
  
  // Add fields that might be Epic Link fields
  const epicLinkFields = fields.filter(field => 
    field.name.toLowerCase().includes('epic') && 
    field.name.toLowerCase().includes('link')
  );
  
  if (epicLinkFields.length > 0) {
    epicLinkFields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.id;
      option.textContent = `${field.name} (${field.id})`;
      jiraEpicLinkFieldSelect.appendChild(option);
    });
  } else {
    // Add default option
    const option = document.createElement('option');
    option.value = 'customfield_10010';
    option.textContent = 'customfield_10010 (default)';
    jiraEpicLinkFieldSelect.appendChild(option);
  }
}

// Helper function to load issues for a project
async function loadProjectIssues(projectKey) {
  try {
    showLoading('Loading Initiatives...');
    
    const jiraConfig = getJiraConfig();
    const result = await window.api.searchJiraIssues(jiraConfig, projectKey);
    
    hideLoading();
    
    if (result.success) {
      // Clear existing options
      jiraParentSelect.innerHTML = '<option value="">None</option>';
      
      // Add issues
      result.issues.forEach(issue => {
        const option = document.createElement('option');
        option.value = issue.key;
        option.textContent = `${issue.key}: ${issue.summary} (${issue.issueType})`;
        jiraParentSelect.appendChild(option);
      });
    } else {
      showStatus(`Error loading project issues: ${result.error}`, true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error loading project issues: ${error.message}`, true);
  }
}

// Create Jira issues
createJiraBtn.addEventListener('click', async () => {
  if (!gherkinContent) {
    showStatus('No Gherkin content to push to Jira', true);
    return;
  }
  
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken', 'projectKey'])) {
    return;
  }
  
  try {
    showLoading('Creating Jira issues...');
    
    const result = await window.api.createJiraIssues(gherkinContent, jiraConfig);
    
    hideLoading();
    
    if (result.success) {
      displayJiraResults(result.createdIssues, jiraConfig.url);
      showStatus(`Successfully created ${result.createdIssues.length} Jira issues!`);
    } else {
      showStatus(`Error creating Jira issues: ${result.error}`, true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error creating Jira issues: ${error.message}`, true);
  }
});

// Helper function to get Jira configuration from form
function getJiraConfig() {
  return {
    url: jiraUrlInput.value.trim(),
    username: jiraUsernameInput.value.trim(),
    apiToken: jiraApiTokenInput.value.trim(),
    projectKey: jiraProjectSelect.value.trim(),
    parentIssueKey: jiraParentSelect.value.trim(),
    epicNameField: jiraEpicNameFieldSelect.value.trim() || 'customfield_10011',
    epicLinkField: jiraEpicLinkFieldSelect.value.trim() || 'customfield_10010',
    epicType: jiraEpicTypeSelect.value.trim() || 'Epic',
    storyType: jiraStoryTypeSelect.value.trim() || 'Story'
  };
}

// Helper function to validate Jira configuration
function validateJiraConfig(config, requiredFields) {
  for (const field of requiredFields) {
    if (!config[field]) {
      showStatus(`Please enter a valid Jira ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`, true);
      return false;
    }
  }
  
  // Validate URL format
  if (config.url && !config.url.match(/^https?:\/\/.+/)) {
    showStatus('Please enter a valid Jira URL (including http:// or https://)', true);
    return false;
  }
  
  return true;
}

// Helper function to display Jira results
function displayJiraResults(issues, jiraUrl) {
  jiraResult.classList.remove('hidden');
  jiraResultContent.innerHTML = '';
  
  // Group issues by type
  const epics = issues.filter(issue => issue.type === 'epic');
  const stories = issues.filter(issue => issue.type === 'story');
  
  // Create HTML for each issue
  for (const epic of epics) {
    const epicElement = document.createElement('div');
    epicElement.className = 'jira-item epic';
    epicElement.innerHTML = `
      <div class="jira-item-title">
        <span class="jira-item-key">${epic.key}</span>: ${epic.summary}
      </div>
      <a href="${epic.url}" class="jira-item-link" target="_blank">View in Jira</a>
    `;
    jiraResultContent.appendChild(epicElement);
    
    // Add related stories
    const epicStories = stories.filter(story => story.epicKey === epic.key);
    for (const story of epicStories) {
      const storyElement = document.createElement('div');
      storyElement.className = 'jira-item story';
      storyElement.innerHTML = `
        <div class="jira-item-title">
          <span class="jira-item-key">${story.key}</span>: ${story.summary}
        </div>
        <a href="${story.url}" class="jira-item-link" target="_blank">View in Jira</a>
      `;
      jiraResultContent.appendChild(storyElement);
    }
  }
  
  // Scroll to results
  jiraResult.scrollIntoView({ behavior: 'smooth' });
}
