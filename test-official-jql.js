const { loadConfig } = require('./dist/commands/config');
const axios = require('axios');

async function testOfficialJQL() {
  try {
    const config = await loadConfig();
    
    console.log('🔍 Testing official Jira JQL syntax...\n');
    
    const getAuthHeader = () => {
      const credentials = Buffer.from(`${config.jiraEmail}:${config.jiraApiKey}`).toString('base64');
      return `Basic ${credentials}`;
    };
    
    // Test the official JQL syntax
    console.log('📋 Official JQL Query:');
    console.log('assignee = currentUser() AND statusCategory NOT IN ("Done") ORDER BY updated DESC\n');
    
    const response = await axios.get(`${config.jiraBaseUrl}/rest/api/3/search/jql`, {
      headers: {
        'Authorization': getAuthHeader(),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      params: {
        jql: 'assignee = currentUser() AND statusCategory NOT IN ("Done") ORDER BY updated DESC',
        fields: 'key,summary,description,status,updated',
        maxResults: 10
      }
    });
    
    const tasks = response.data.issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      statusCategory: issue.fields.status.statusCategory.name,
      updated: issue.fields.updated
    }));
    
    console.log('✅ Tasks found with official JQL syntax:', tasks.length);
    if (tasks.length === 0) {
      console.log('ℹ️ No active tasks found (all assigned tasks are Done)');
    } else {
      tasks.forEach((task, i) => {
        console.log(`${i+1}. ${task.key}: ${task.summary}`);
        console.log(`   Status: ${task.status} (Category: ${task.statusCategory})`);
        console.log(`   Updated: ${task.updated}`);
        
        if (task.summary.includes('OBJETOS')) {
          console.log('   ⭐ THIS IS THE TASK YOU WANT!');
        }
        console.log('');
      });
      
      console.log(`🎯 Result: "${tasks[0].summary}" will be selected as current task.`);
    }
    
  } catch (error) {
    console.error('❌ Error testing official JQL:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testOfficialJQL();