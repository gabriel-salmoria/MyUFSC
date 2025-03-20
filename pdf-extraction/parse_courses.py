import json
import re

def parse_course_block(text):
    # Split the text into lines and remove empty lines
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    if not lines:
        return None
    
    # First line(s) are the description until we find a course code
    description_lines = []
    code = None
    name_lines = []
    type_line = None
    workload = None
    credits = None
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # If we haven't found a code yet, this is part of the description
        if not code:
            code_match = re.match(r'([A-Z]{3}\d{4})', line)
            if code_match:
                code = code_match.group(1)
                # If there's text after the code, it's the start of the name
                if len(line) > len(code):
                    name_lines.append(line[len(code):].strip())
                i += 1
            else:
                description_lines.append(line)
                i += 1
        # If we have a code but no name yet, this is part of the name
        elif not name_lines:
            name_lines.append(line)
            i += 1
        # If we have code and name but no type, look for type/workload/credits
        elif not type_line:
            if re.match(r'[Oo][bp]\s+\d+\s+\d+', line):
                type_line = line
                type_match = re.match(r'([Oo][bp])\s+(\d+)\s+(\d+)', line)
                if type_match:
                    course_type = "mandatory" if type_match.group(1).lower() == "ob" else "optional"
                    workload = int(type_match.group(2))
                    credits = int(type_match.group(3))
            i += 1
        else:
            i += 1
    
    if not code or not name_lines or not type_line:
        return None
    
    # Parse prerequisites and equivalents if they exist
    prerequisites = []
    equivalents = []
    
    for line in lines:
        if line.startswith('('):
            # Extract prerequisites and equivalents from parentheses
            matches = re.findall(r'\(([^)]+)\)', line)
            for match in matches:
                # Split by 'eh' or 'ou' to separate prerequisites and equivalents
                parts = re.split(r'\s*(?:eh|ou)\s*', match)
                prerequisites.extend([p.strip() for p in parts])
                equivalents.extend([p.strip() for p in parts])
    
    return {
        "id": code,
        "name": " ".join(name_lines),
        "type": course_type,
        "credits": credits,
        "workload": workload,
        "prerequisites": prerequisites,
        "equivalents": equivalents,
        "description": " ".join(description_lines)
    }

def parse_phase(text):
    # Split the text into course blocks
    # Each course block starts with a description and ends before the next description
    course_blocks = []
    current_block = []
    
    # Split by multiple newlines to separate course blocks
    blocks = re.split(r'\n\s*\n', text)
    
    for block in blocks:
        if block.strip():
            course = parse_course_block(block)
            if course:
                course_blocks.append(course)
    
    return course_blocks

def parse_file(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split content into phases
    # Look for "Fase XX" followed by multiple newlines
    phases = re.split(r'Fase\s+\d+\s*\n\s*\n', content)[1:]  # Skip the first split which is before Phase 1
    
    # Parse each phase
    all_courses = []
    for i, phase in enumerate(phases, 1):
        courses = parse_phase(phase)
        for course in courses:
            course['phase'] = i
            all_courses.append(course)
    
    # Create the final JSON structure
    output = {
        "id": "cs-208",
        "name": "CIÊNCIAS DA COMPUTAÇÃO",
        "department": "Bacharelado em Ciências da Computação",
        "totalPhases": 8,
        "courses": all_courses
    }
    
    # Write to output file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    parse_file("pdf-extraction/example1.txt", "pdf-extraction/output.json") 