import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import './App.css';
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface Team {
  id: string;
  gender: 'Ganda Putra' | 'Ganda Putri' | 'Fun Match';
  name: string;
}

// Wrap your App component with the provider
function AppWithRecaptcha() {
  const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
  
  if (!recaptchaKey) {
    console.error("reCAPTCHA site key is not set. Please add VITE_RECAPTCHA_SITE_KEY to your .env file.");
    return <div className="App"><h1>Error: reCAPTCHA not configured.</h1></div>;
  }

  return (
    <GoogleReCaptchaProvider reCaptchaKey={recaptchaKey} useRecaptchaNet={false}>
      <App />
    </GoogleReCaptchaProvider>
  );
}

function App() {
  const [selectedGender, setSelectedGender] = useState<'Ganda Putra' | 'Ganda Putri' | 'Fun Match' | ''>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [buttonDisabled, setButtonDisabled] = useState<boolean>(false);
  const [generatedNumber, setGeneratedNumber] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Hook to execute reCAPTCHA
  const { executeRecaptcha } = useGoogleReCaptcha();

  const findTeamsWithoutGeneratedNumbers = useCallback(async () => {
    setIsLoading(true);

    // Fetch all teams
    const { data: allTeams, error: teamsError } = await supabase
      .from('teams')
      .select('*');

    if (teamsError) {
      console.error('Error mendapatkan semua teams:', teamsError.message);
      setMessage('Error mendapatkan teams.');
      setIsLoading(false);
      return;
    }

    // Fetch all generated numbers to get team_ids that have numbers
    const { data: generatedNumbersData, error: numbersError } = await supabase
      .from('generated_numbers')
      .select('team_id');

    if (numbersError) {
      console.error('Error mendapatkan generated numbers:', numbersError.message);
      setMessage('Error mendapatkan generated numbers data.');
      setIsLoading(false);
      return;
    }

    // Extract team_ids that already have generated numbers
    const teamIdsWithNumbers = new Set(generatedNumbersData?.map(gn => gn.team_id));

    // Filter teams that are not in the set of team_idsWithNumbers
    const teamsWithout = (allTeams || []).filter(team => !teamIdsWithNumbers.has(team.id));

    setTeams(teamsWithout);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    findTeamsWithoutGeneratedNumbers();
  }, [findTeamsWithoutGeneratedNumbers]);

  // Filter teams based on selected gender
  useEffect(() => {
    if (selectedGender) {
      const filtered = teams.filter(team => team.gender === selectedGender);
      setFilteredTeams(filtered);
      setSelectedTeam('');
    } else {
      setFilteredTeams([]);
      setSelectedTeam('');
    }
  }, [selectedGender, teams]);

  const handleGenderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGender(event.target.value as 'Ganda Putra' | 'Ganda Putri' | 'Fun Match' | '');
    setGeneratedNumber(null); // Clear previous number
    setMessage('');
  };

  const handleTeamChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(event.target.value);
    setGeneratedNumber(null); // Clear previous number
    setMessage('');
  };

  const handleGenerateClick = async () => {
    if (!selectedTeam) {
      setMessage('Please select a team.');
      return;
    }

    if (!executeRecaptcha) {
      setMessage('reCAPTCHA not loaded yet. Please try again in a moment.');
      return;
    }

    setIsLoading(true);
    setMessage('Verifying CAPTCHA...');

    try {
      // 1. Execute reCAPTCHA on the client-side to get a token
      const token = await executeRecaptcha('generate_number'); // 'generate_number' is your action name

      if (!token) {
        setMessage('reCAPTCHA verification failed. No token received.');
        setIsLoading(false);
        return;
      }

      // 2. Send the token to your Vercel Serverless Function for server-side verification
      const verificationApiUrl = '/api/verify-recaptcha'; // This path maps to your Vercel Serverless Function
      const apiResponse = await fetch(verificationApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const verificationResponse = await apiResponse.json();

      if (!verificationResponse.success || verificationResponse.score < 0.5) { // Adjust score as needed (0.0 to 1.0)
        setMessage(`reCAPTCHA verification failed. Score: ${verificationResponse.score}. You might be a bot!`);
        console.error('reCAPTCHA verification failed:', verificationResponse);
        setIsLoading(false);
        return;
      }

      // 3. If reCAPTCHA verification passes, proceed with your application logic
      setMessage('reCAPTCHA verified. Generating number...');
      await generateAndSaveRandomNumber();

    } catch (error: any) {
      console.error('reCAPTCHA execution or API call error:', error);
      setMessage(`Error during verification: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const generateAndSaveRandomNumber = async () => {
    if (!selectedTeam) {
      setMessage('Tolong pilih team.');
      return;
    }

    setIsLoading(true);
    setGeneratedNumber(null);
    setMessage('');

    //Get total max number based on data
    const { data: allTeams, error: fetchAllTeamsError } = await supabase.from('teams').select('*');
    if (fetchAllTeamsError) {
      console.error('Error mendapatkan nomor drawing:', fetchAllTeamsError.message);
      setMessage('Error mendapatkan nomor drawing data.');
      setIsLoading(false);
      return;
    }
    const maxNumber = allTeams.filter(team => team.gender === selectedGender).length;

    let newRandomNumber: number;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = maxNumber; // Prevent infinite loops

    while (!isUnique && attempts < maxAttempts) {
      newRandomNumber = Math.floor(Math.random() * maxNumber) + 1; // Generates a number between 1 and maxNumber

      // Check if this number has already been generated
      const { data: existingNumberData, error: fetchError } = await supabase
        .from('generated_numbers')
        .select('*')
        .eq('random_number', newRandomNumber);

      if (fetchError) {
        console.error('Error mengecek nomor yang sudah ada:', fetchError.message);
        setMessage('Error mendapatkan nomor drawing. Mohon coba lagi.');
        setIsLoading(false);
        return;
      }

      if (existingNumberData && existingNumberData.length === 0) {
        isUnique = true;
      }
      else { //if there is random number available
        const teamIds = new Set(existingNumberData?.map(gn => gn.team_id));
        const teams = allTeams.filter(f => teamIds.has(f.id));

        //if random number not exist in the same gender teams
        if (!teams.some(s => s.gender === selectedGender)) {
          isUnique = true;
        }
      }
      attempts++;
    }

    if (!isUnique) {
      setMessage('Nomor sudah diambil, silahkan dapatkan nomor lagi.');
      setIsLoading(false);
      return;
    }

    // Save the new unique random number to the database
    const { error: insertError } = await supabase
      .from('generated_numbers')
      .insert({ team_id: selectedTeam, random_number: newRandomNumber! });

    if (insertError) {
      console.error('Error menyimpan nomor drawing:', insertError.message);
      setMessage('Error menyimpan nomor. Mohon coba lagi.');
    } else {
      setGeneratedNumber(newRandomNumber!);
      setMessage(`Nomor drawing di simpan untuk team: ${teams.find(t => t.id === selectedTeam)?.name}`);
    }
    setButtonDisabled(true);
    setIsLoading(false);
  };

  return (
    <div className="App">
      <h1>Badminton Itrop 2025 Drawing</h1>

      <div className="form-group">
        <label htmlFor="category">Pilih Kategori:</label>
        <select id="category" value={selectedGender} onChange={handleGenderChange} disabled={isLoading}>
          <option value="">-- Pilih Kategori --</option>
          <option value="Ganda Putra">Ganda Putra</option>
          <option value="Ganda Putri">Ganda Putri</option>
          <option value="Fun Match">Fun Match</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="team">Pilih Team:</label>
        <select id="team" value={selectedTeam} onChange={handleTeamChange} disabled={!selectedGender || isLoading}>
          {filteredTeams.length === 0 ? (
            <option value="">-- Tidak Ada Team Tersedia --</option>
          ) : (
            <>
              <option value="">-- Pilih Team --</option>
              {filteredTeams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      <button onClick={generateAndSaveRandomNumber} disabled={!selectedTeam || isLoading || buttonDisabled}>
        {isLoading ? 'Mendapatkan...' : 'Dapatkan Nomor Drawing'}
      </button>

      {generatedNumber !== null && (
        <div className="result">
          <h2>Nomor Drawing: {generatedNumber}</h2>
        </div>
      )}

      {message && <p className="message">{message}</p>}
    </div>
  );
}

export default AppWithRecaptcha;