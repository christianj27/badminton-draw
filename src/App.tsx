import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

interface Team {
  id: string;
  gender: 'pria' | 'wanita';
  name: string;
}

function App() {
  const [selectedGender, setSelectedGender] = useState<'pria' | 'wanita' | ''>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [buttonDisabled, setButtonDisabled] = useState<boolean>(false);
  const [generatedNumber, setGeneratedNumber] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

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
    setSelectedGender(event.target.value as 'pria' | 'wanita' | '');
    setGeneratedNumber(null); // Clear previous number
    setMessage('');
  };

  const handleTeamChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(event.target.value);
    setGeneratedNumber(null); // Clear previous number
    setMessage('');
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
      console.error('Error mendapatkan generated numbers:', fetchAllTeamsError.message);
      setMessage('Error mendapatkan generated numbers data.');
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
        <label htmlFor="gender">Pilih Gender:</label>
        <select id="gender" value={selectedGender} onChange={handleGenderChange} disabled={isLoading}>
          <option value="">-- Pilih Gender --</option>
          <option value="pria">Pria</option>
          <option value="wanita">Wanita</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="team">Pilih Team:</label>
        <select id="team" value={selectedTeam} onChange={handleTeamChange} disabled={!selectedGender || isLoading}>
          {filteredTeams.length === 0 ? (
            <option value="">-- Tidak Team Tersedia --</option>
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

export default App;