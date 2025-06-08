// Create Jira issues from Gherkin content
ipcMain.handle('create-jira-issues', async (event, { gherkinContent, jiraConfig, folderName }) => {
  try {
    const {
      url,
      username,
      apiToken,
      projectKey,
      parentIssueKey, // This is either the Initiative key (Level 3) or Epic key (Level 2)
      hierarchyLevel = 'level3', // Selected hierarchy level
      epicNameField = 'customfield_10011',
      epicLinkField = 'customfield_10010',
      featureField = 'description', // Custom field for Feature content
      storyField = 'customfield_10577', // Custom field for Story scenario content
      subtaskField = 'description', // Custom field for Sub-task content
      epicType = 'Epic', // Level 2
      featureType = 'Feature', // Level 1
      storyType = 'Story', // Level 0
      subtaskType = 'Sub-task', // For Level 2 parent hierarchy
      selectedItems = [] // New property for selected items
    } = jiraConfig;
    
    console.log('Creating Jira issues with config:', {
      url,
      username: username ? '(provided)' : '(missing)',
      apiToken: apiToken ? '(provided)' : '(missing)',
      projectKey,
      parentIssueKey,
      hierarchyLevel,
      epicNameField,
      epicLinkField,
      featureField,
      storyField,
      subtaskField,
      epicType,
      featureType,
      storyType,
      subtaskType
    });
    
    // Create Jira client
    const jira = new JiraClient({
      protocol: url.startsWith('https') ? 'https' : 'http',
      host: url.replace(/^https?:\/\//, ''),
      username: username,
      password: apiToken,
      apiVersion: '2',
      strictSSL: true
    });
    
    // Get available issue types for the project
    console.log(`Getting available issue types for project ${projectKey}`);
    const projectData = await jira.getProject(projectKey);
    const projectIssueTypes = projectData.issueTypes || [];
    console.log('Available issue types:', projectIssueTypes.map(t => t.name));
    
    // Use the specified Epic Work Type ID 10472
    const availableEpicType = {
      id: '10472',
      name: 'Level 2 Epic'
    };
    
    const availableFeatureType = projectIssueTypes.find(t => 
      t.name.toLowerCase() === featureType.toLowerCase() || 
      t.name.toLowerCase().includes('feature') ||
      t.name.toLowerCase().includes('story')
    );
    
    const availableStoryType = projectIssueTypes.find(t => 
      t.name.toLowerCase() === storyType.toLowerCase() || 
      t.name.toLowerCase().includes('story') ||
      t.name.toLowerCase().includes('task') ||
      t.name.toLowerCase().includes('sub-task')
    );
    
    // Find the Sub-task issue type
    const availableSubtaskType = projectIssueTypes.find(t => 
      t.name.toLowerCase() === subtaskType.toLowerCase() || 
      t.name.toLowerCase().includes('sub-task') ||
      t.name.toLowerCase().includes('subtask') ||
      t.subtask === true
    );
    
    if (!availableEpicType) {
      throw new Error(`Epic issue type "${epicType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableFeatureType) {
      throw new Error(`Feature issue type "${featureType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableStoryType) {
      throw new Error(`Story issue type "${storyType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableSubtaskType) {
      throw new Error(`Sub-task issue type "${subtaskType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    console.log('Using issue types:', {
      epic: availableEpicType.name,
      feature: availableFeatureType.name,
      story: availableStoryType.name,
      subtask: availableSubtaskType.name
    });
    
    // Parse Gherkin content
    const parsedFeatures = parseGherkinContent(gherkinContent);
    
    // Log the parsed features and scenarios for debugging
    console.log('Parsed Features:', parsedFeatures.map(f => ({
      name: f.name,
      scenarioCount: f.scenarios.length,
      scenarios: f.scenarios.map(s => s.name)
    })));
    
    // Check if we have selected items
    const hasSelectedItems = Array.isArray(selectedItems) && selectedItems.length > 0;
    console.log('Has selected items:', hasSelectedItems, 'Count:', selectedItems.length);
    
    // Create issues in Jira
    const createdIssues = [];
    
    // Convert folder name to Title Case for Epic name
    const toTitleCase = (str) => {
      return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
      });
    };
    
    // Use folder name as Epic name, or default if not provided
    const epicName = folderName ? toTitleCase(folderName) : "Feature Files";
    
    // Generate a unique ID for tracking items
    let idCounter = 1;
    
    // Check if we're using Level 3 or Level 2 as parent
    const isLevel3Parent = hierarchyLevel === 'level3';
    
    if (isLevel3Parent) {
      // Level 3 → Epic → Feature → Story hierarchy
      
      // First, create an Epic (Level 2) under the Initiative (Level 3)
      const epicId = `item-${idCounter++}`;
      
      // Check if Epic is selected (or if we're not using selection)
      const shouldCreateEpic = !hasSelectedItems || 
        selectedItems.some(item => item.type === 'epic' && item.id === epicId);
      
      let epicIssue = null;
      
      if (shouldCreateEpic) {
        const epicFields = {
          project: {
            key: projectKey
          },
          summary: epicName,
          issuetype: {
            id: availableEpicType.id
          }
        };
        
        // Link to parent Initiative if specified
        if (parentIssueKey) {
          epicFields.parent = {
            key: parentIssueKey
          };
        }
        
        // Create the Epic
        epicIssue = await jira.addNewIssue({
          fields: epicFields
        });
        
        createdIssues.push({
          key: epicIssue.key,
          type: 'epic',
          summary: epicName,
          url: `${url}/browse/${epicIssue.key}`
        });
        
        console.log('Created Epic:', epicIssue.key);
      } else {
        console.log('Skipping Epic creation (not selected)');
      }
      
      // Now create Features under the Epic
      for (const feature of parsedFeatures) {
        // Generate a unique ID for this feature
        const featureId = `item-${idCounter++}`;
        
        // Check if Feature is selected (or if we're not using selection)
        const shouldCreateFeature = !hasSelectedItems || 
          selectedItems.some(item => item.type === 'feature' && item.id === featureId);
        
        // Skip if not selected or if Epic wasn't created
        if (!shouldCreateFeature || !epicIssue) {
          console.log(`Skipping Feature "${feature.name}" (not selected or Epic not created)`);
          
          // Increment counter for scenarios to maintain ID consistency
          idCounter += feature.scenarios.length;
          continue;
        }
        
        // Format the feature content with bold keywords for Feature description
        let formattedFeature = feature.content;
        
        // Bold the Feature keyword and add space after keywords
        formattedFeature = formattedFeature
          .replace(/^(Feature:)/gm, '*$1* ')
          .replace(/^Scenario:/gm, '**Scenario:**')
          .replace(/^Scenario Outline:/gm, '**Scenario Outline:**')
          .replace(/^(\s*)(Given)/gm, '$1*$2* ')
          .replace(/^(\s*)(When)/gm, '$1*$2* ')
          .replace(/^(\s*)(Then)/gm, '$1*$2* ')
          .replace(/^(\s*)(And)/gm, '$1*$2* ')
          .replace(/^(\s*)(But)/gm, '$1*$2* ');
        
        // Create Feature issue
        const featureFields = {
          project: {
            key: projectKey
          },
          summary: feature.name,
          issuetype: {
            id: availableFeatureType.id
          }
        };
        
        // Create a code block with Gherkin syntax for the Feature description
        const gherkinCodeBlock = `{code:language=gherkin}\n${feature.content}\n{code}`;
        featureFields.description = gherkinCodeBlock;
        
        // Set the custom Feature field if specified and not 'description'
        if (featureField && featureField !== 'description') {
          featureFields[featureField] = gherkinCodeBlock;
        }
        
        // Make Feature a child of the Epic
        featureFields.parent = {
          key: epicIssue.key
        };
        
        const featureIssue = await jira.addNewIssue({
          fields: featureFields
        });
        
        createdIssues.push({
          key: featureIssue.key,
          type: 'feature',
          summary: feature.name,
          epicKey: epicIssue.key,
          url: `${url}/browse/${featureIssue.key}`
        });
        
        console.log('Created Feature:', featureIssue.key);
        
        // Create Stories for each Scenario
        for (const scenario of feature.scenarios) {
          try {
            // Generate a unique ID for this story
            const storyId = `item-${idCounter++}`;
            
            // Check if Story is selected (or if we're not using selection)
            const shouldCreateStory = !hasSelectedItems || 
              selectedItems.some(item => item.type === 'story' && item.id === storyId);
            
            // Skip if not selected
            if (!shouldCreateStory) {
              console.log(`Skipping Story "${scenario.name}" (not selected)`);
              continue;
            }
            
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
            
            const storyFields = {
              project: {
                key: projectKey
              },
              summary: scenario.name,
              issuetype: {
                id: availableStoryType.id
              },
              // Link to parent Feature
              parent: {
                key: featureIssue.key
              }
            };
            
            // Create a code block with Gherkin syntax for the Story description
            const scenarioGherkinCodeBlock = `{code:language=gherkin}\n${scenario.content}\n{code}`;
            storyFields.description = scenarioGherkinCodeBlock;
            
            // Only set the custom Story field if it's not 'description' (which is already set)
            if (storyField && storyField !== 'description') {
              storyFields[storyField] = scenarioGherkinCodeBlock;
            }
            
            // Create the Story issue
            const storyIssue = await jira.addNewIssue({
              fields: storyFields
            });
            
            // Populate custom field 11201 with the Feature's summary
            await jira.updateIssue(storyIssue.key, {
              fields: {
                "customfield_11201": feature.name
              }
            });
            
            // Create a "Relates" link between the Story and its parent Feature
            try {
              await jira.issueLink({
                type: {
                  name: "Relates"
                },
                inwardIssue: {
                  key: storyIssue.key
                },
                outwardIssue: {
                  key: featureIssue.key
                }
              });
              console.log(`Created "Relates" link from ${storyIssue.key} to ${featureIssue.key}`);
            } catch (linkError) {
              // If link creation fails, just log the error but don't fail the whole process
              console.error(`Could not create link between ${storyIssue.key} and ${featureIssue.key}: ${linkError.message}`);
            }
            
            createdIssues.push({
              key: storyIssue.key,
              type: 'story',
              summary: scenario.name,
              featureKey: featureIssue.key,
              url: `${url}/browse/${storyIssue.key}`
            });
            
            console.log('Created Story:', storyIssue.key);
          } catch (storyError) {
            console.error(`Error creating Story for scenario "${scenario.name}":`, storyError);
          }
        }
      }
    } else {
      // Level 2 → Story → Sub-task hierarchy
      // Map Feature in file to Story in Jira, and Scenario in file to Sub-task in Jira
      
      // Now create Stories (from Features in the file) under the parent Epic
      for (const feature of parsedFeatures) {
        // Generate a unique ID for this story
        const storyId = `item-${idCounter++}`;
        
        // Check if Story is selected (or if we're not using selection)
        const shouldCreateStory = !hasSelectedItems || 
          selectedItems.some(item => item.type === 'story' && item.id === storyId);
        
        // Skip if not selected or if parent Epic key wasn't provided
        if (!shouldCreateStory || !parentIssueKey) {
          console.log(`Skipping Story "${feature.name}" (not selected or parent not available)`);
          
          // Increment counter for scenarios to maintain ID consistency
          idCounter += feature.scenarios.length;
          continue;
        }
        
        // Format the feature content with bold keywords for Story description
        let formattedFeature = feature.content;
        
        // Bold the Feature keyword and add space after keywords
        formattedFeature = formattedFeature
          .replace(/^(Feature:)/gm, '*$1* ')
          .replace(/^Scenario:/gm, '**Scenario:**')
          .replace(/^Scenario Outline:/gm, '**Scenario Outline:**')
          .replace(/^(\s*)(Given)/gm, '$1*$2* ')
          .replace(/^(\s*)(When)/gm, '$1*$2* ')
          .replace(/^(\s*)(Then)/gm, '$1*$2* ')
          .replace(/^(\s*)(And)/gm, '$1*$2* ')
          .replace(/^(\s*)(But)/gm, '$1*$2* ');
        
        // Create Story issue (from Feature in file)
        const storyFields = {
          project: {
            key: projectKey
          },
          summary: feature.name,
          issuetype: {
            id: availableStoryType.id
          }
        };
        
        // Create a code block with Gherkin syntax for the Story description
        const gherkinCodeBlock = `{code:language=gherkin}\n${feature.content}\n{code}`;
        storyFields.description = gherkinCodeBlock;
        
        // Link to parent Epic
        storyFields.parent = {
          key: parentIssueKey
        };
        
        // Only set the custom Story field if it's not 'description' (which is already set)
        if (storyField && storyField !== 'description') {
          storyFields[storyField] = gherkinCodeBlock;
        }
        
        const storyIssue = await jira.addNewIssue({
          fields: storyFields
        });
        
        // Populate custom field 11201 with the Feature's name
        await jira.updateIssue(storyIssue.key, {
          fields: {
            "customfield_11201": feature.name
          }
        });
        
        createdIssues.push({
          key: storyIssue.key,
          type: 'story',
          summary: feature.name,
          epicKey: parentIssueKey,
          url: `${url}/browse/${storyIssue.key}`
        });
        
        console.log('Created Story (from Feature):', storyIssue.key);
        
        // Create Sub-tasks for each Scenario
        for (const scenario of feature.scenarios) {
          try {
            // Generate a unique ID for this subtask
            const subtaskId = `item-${idCounter++}`;
            
            // Check if Subtask is selected (or if we're not using selection)
            const shouldCreateSubtask = !hasSelectedItems || 
              selectedItems.some(item => item.type === 'subtask' && item.id === subtaskId);
            
            // Skip if not selected
            if (!shouldCreateSubtask) {
              console.log(`Skipping Sub-task for "${scenario.name}" (not selected)`);
              continue;
            }
            
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
            
            // Create a code block with Gherkin syntax for the Sub-task description
            const scenarioGherkinCodeBlock = `{code:language=gherkin}\n${scenario.content}\n{code}`;
            
            // Create Sub-task fields
            const subtaskFields = {
              project: {
                key: projectKey
              },
              summary: scenario.name,
              issuetype: {
                id: availableSubtaskType.id
              },
              // Link to parent Story
              parent: {
                key: storyIssue.key
              },
              description: scenarioGherkinCodeBlock
            };
            
            // Only set the custom Sub-task field if it's not 'description' (which is already set)
            if (subtaskField && subtaskField !== 'description') {
              subtaskFields[subtaskField] = scenarioGherkinCodeBlock;
            }
            
            // Create the Sub-task issue
            const subtaskIssue = await jira.addNewIssue({
              fields: subtaskFields
            });
            
            createdIssues.push({
              key: subtaskIssue.key,
              type: 'subtask',
              summary: scenario.name,
              storyKey: storyIssue.key,
              url: `${url}/browse/${subtaskIssue.key}`
            });
            
            console.log('Created Sub-task:', subtaskIssue.key);
          } catch (subtaskError) {
            console.error(`Error creating Sub-task for scenario "${scenario.name}":`, subtaskError);
          }
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
