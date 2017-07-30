import csv
import os
import json
import re
from pprint import pprint

if os.path.exists('adjacency_matrix.json'):
    with open('adjacency_matrix.json') as adjancency_matrix_file: 
        adjacency_matrix_serializable = json.load(adjancency_matrix_file)
        adjacency_matrix = {r: set(rs) for r, rs in adjacency_matrix_serializable.items()}
else: 
    with open('researchers.json') as researchers_file:    
        researchers_data = json.load(researchers_file)
    with open('documents.json') as documents_file:    
        documents = json.load(documents_file)['items']


    documents = [d for d in documents if d['type'] != 'invited_talk']
    authors_collaborations = [[re.sub('\s?\w\.', '', a) for a in d['authorsStr'].split(', ')] for d in documents]
    all_authors = {a for authors in authors_collaborations for a in authors}
    researchers_data = [r for r in researchers_data if r['surname'] in all_authors]

    researchers = [r['surname'] for r in researchers_data if not list(filter(lambda r2: r['username'] < r2['username'] and r['surname'] == r2['surname'], researchers_data))]
    pprint(len(researchers))

    adjacency_matrix = {r: {r2 for a in authors_collaborations for r2 in researchers if r in a and r2 in a and r!=r2} for r in researchers}
    adjacency_matrix_serializable = {r: list(rs) for r, rs in adjacency_matrix.items()}
    with open('adjacency_matrix.json', 'w') as outfile:
        json.dump(adjacency_matrix_serializable, outfile)


csv_am = [tuple([r] + list(rs)) for (r, rs) in adjacency_matrix.items()]

with open('adjacency_matrix.csv', 'w') as csvfile:
    csvwriter = csv.writer(csvfile, delimiter=';',
                            quotechar='', quoting=csv.QUOTE_NONE)
    csvwriter.writerows(csv_am)